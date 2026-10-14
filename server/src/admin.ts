import { Router } from 'express';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import {
  idSchema,
  listSchema,
  reportFilterSchema,
  userCreateSchema,
  userAdminSchema,
  passwordResetSchema,
} from '@ledgerline/shared';
import { read, transaction } from './db.ts';
import { permit, checkCsrf, type Identity } from './auth.ts';
import { hashPassword } from './crypto.ts';
import { ApiError } from './errors.ts';
const like = (s: string) => '%' + s.replace(/[!%_]/g, (c) => '!' + c) + '%';
async function userRecord(db: PoolConnection, id: string) {
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT CAST(user_id AS CHAR) id,name,email,account_status,row_version,created_at FROM users WHERE user_id=?',
    [id],
  );
  if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'User not found.');
  const [roles] = await db.execute<RowDataPacket[]>(
    'SELECT r.role_name FROM user_roles ur JOIN roles r USING(role_id) WHERE ur.user_id=? ORDER BY r.role_name',
    [id],
  );
  return {
    ...rows[0],
    id: String(rows[0].id),
    row_version: Number(rows[0].row_version),
    roles: roles.map((r) => String(r.role_name)),
  };
}
async function adminLock(db: PoolConnection, actor: string) {
  // Serialize administration changes so two demotions cannot remove the last active administrator.

  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT u.user_id FROM users u JOIN user_roles ur USING(user_id) JOIN role_permissions rp USING(role_id) JOIN permissions p USING(permission_id) WHERE u.user_id=? AND u.account_status='active' AND p.permission_code='users.administer' FOR SHARE",
    [actor],
  );
  if (!rows.length)
    throw new ApiError(403, 'FORBIDDEN', 'Administrator access changed. Sign in again.');
}
async function rolesFor(db: PoolConnection, id: string, roles: string[]) {
  await db.execute('DELETE FROM user_roles WHERE user_id=?', [id]);
  for (const role of roles)
    await db.execute(
      'INSERT INTO user_roles(user_id,role_id) SELECT ?,role_id FROM roles WHERE role_name=?',
      [id, role],
    );
}
async function audit(
  db: PoolConnection,
  actor: string,
  action: string,
  id: string,
  before: unknown,
  after: unknown,
  requestId: string,
) {
  await db.execute(
    'INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,before_values,after_values,http_request_id) VALUES (?,?,?,?,?,?,?)',
    [
      actor,
      action,
      'users',
      id,
      before ? JSON.stringify(before) : null,
      JSON.stringify(after),
      requestId,
    ],
  );
}
async function locked(db: PoolConnection, id: string, version: number) {
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT user_id,row_version,password_hash IS NOT NULL has_password FROM users WHERE user_id=? FOR UPDATE',
    [id],
  );
  if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'User not found.');
  if (Number(rows[0].row_version) !== version)
    throw new ApiError(409, 'STALE_RECORD', 'This user changed. Reload before saving.');
  return rows[0];
}
async function adminTransaction<T>(
  pool: Pool,
  work: (db: PoolConnection) => Promise<T>,
): Promise<T> {
  return read(pool, async (db) => {
    const [lock] = await db.query<RowDataPacket[]>(
      "SELECT GET_LOCK(CONCAT('ledgerline:admin:',DATABASE()),5) acquired",
    );
    if (Number(lock[0].acquired) !== 1)
      throw new ApiError(
        409,
        'RETRY_REQUIRED',
        'Another administrator is making a change. Try again.',
      );
    try {
      await db.beginTransaction();
      try {
        const result = await work(db);
        await db.commit();
        return result;
      } catch (e) {
        await db.rollback();
        throw e;
      }
    } finally {
      try {
        await db.query("SELECT RELEASE_LOCK(CONCAT('ledgerline:admin:',DATABASE()))");
      } catch {
        db.destroy();
      }
    }
  });
}
export function adminRouter(pool: Pool) {
  const router = Router();
  router.get('/users', permit('users.administer'), async (req, res) => {
    const q = listSchema.parse(req.query);
    if (q.status && !['active', 'invited', 'disabled'].includes(q.status))
      throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid user status.');
    res.json(
      await transaction(pool, async (db) => {
        const args = [like(q.search), like(q.search), q.status, q.status];
        const where =
          "(name LIKE ? ESCAPE '!' OR email LIKE ? ESCAPE '!') AND (?='' OR account_status=?)";
        const [count] = await db.query<RowDataPacket[]>(
          'SELECT COUNT(*) total FROM users WHERE ' + where,
          args,
        );
        const [ids] = await db.query<RowDataPacket[]>(
          'SELECT user_id FROM users WHERE ' + where + ' ORDER BY user_id DESC LIMIT ? OFFSET ?',
          [...args, q.pageSize, (q.page - 1) * q.pageSize],
        );
        const items = [];
        for (const row of ids) items.push(await userRecord(db, String(row.user_id)));
        return { items, total: Number(count[0].total), page: q.page, pageSize: q.pageSize };
      }),
    );
  });
  router.get('/users/:id', permit('users.administer'), async (req, res) =>
    res.json(await read(pool, (db) => userRecord(db, idSchema.parse(req.params.id)))),
  );
  router.get('/roles', permit('users.administer'), async (_req, res) => {
    res.json(
      await read(pool, async (db) => {
        const [rows] = await db.query<RowDataPacket[]>(
          'SELECT r.role_name,r.description,p.permission_code FROM roles r LEFT JOIN role_permissions rp USING(role_id) LEFT JOIN permissions p USING(permission_id) ORDER BY r.role_name,p.permission_code',
        );
        const roles = new Map<
          string,
          { name: string; description: string; permissions: string[] }
        >();
        for (const row of rows) {
          if (!roles.has(row.role_name))
            roles.set(row.role_name, {
              name: row.role_name,
              description: row.description,
              permissions: [],
            });
          if (row.permission_code) roles.get(row.role_name)!.permissions.push(row.permission_code);
        }
        return { items: [...roles.values()] };
      }),
    );
  });
  router.post('/users', permit('users.administer'), checkCsrf, async (req, res) => {
    const v = userCreateSchema.parse(req.body),
      actor = (res.locals.identity as Identity).user.id,
      pw = await hashPassword(v.password);
    const result = await adminTransaction(pool, async (db) => {
      await adminLock(db, actor);
      await db.execute(
        "INSERT INTO users(name,email,password_hash,account_status) VALUES (?,?,?,'active')",
        [v.name, v.email, pw],
      );
      const [last] = await db.query<RowDataPacket[]>('SELECT CAST(LAST_INSERT_ID() AS CHAR) id');
      const id = String(last[0].id);
      await rolesFor(db, id, v.roles);
      const result = await userRecord(db, id);
      await audit(db, actor, 'users.create', id, null, result, res.locals.requestId);
      return result;
    });
    res.status(201).json(result);
  });
  router.patch('/users/:id', permit('users.administer'), checkCsrf, async (req, res) => {
    const id = idSchema.parse(req.params.id),
      v = userAdminSchema.parse(req.body),
      actor = (res.locals.identity as Identity).user.id;
    res.json(
      await adminTransaction(pool, async (db) => {
        await adminLock(db, actor);
        const row = await locked(db, id, v.row_version),
          before = await userRecord(db, id);
        if (id === actor && (v.account_status !== 'active' || !v.roles.includes('administrator')))
          throw new ApiError(
            409,
            'SELF_LOCKOUT',
            'You cannot disable your own account or remove your own administrator role.',
          );
        if (v.account_status === 'active' && !Number(row.has_password))
          throw new ApiError(
            409,
            'PASSWORD_REQUIRED',
            'Set a password before activating this user.',
          );
        if (v.account_status !== 'active' || !v.roles.includes('administrator')) {
          const [admins] = await db.execute<RowDataPacket[]>(
            "SELECT COUNT(DISTINCT u.user_id) n FROM users u JOIN user_roles ur USING(user_id) JOIN roles r USING(role_id) WHERE u.account_status='active' AND r.role_name='administrator' AND u.user_id<>?",
            [id],
          );
          if (!Number(admins[0].n))
            throw new ApiError(409, 'LAST_ADMIN', 'Keep at least one active administrator.');
        }
        await db.execute(
          'UPDATE users SET name=?,email=?,account_status=?,row_version=row_version+1 WHERE user_id=?',
          [v.name, v.email, v.account_status, id],
        );
        await rolesFor(db, id, v.roles);
        await db.execute(
          'UPDATE sessions SET revoked_at=UTC_TIMESTAMP(6) WHERE user_id=? AND revoked_at IS NULL',
          [id],
        );
        const result = await userRecord(db, id);
        await audit(db, actor, 'users.update', id, before, result, res.locals.requestId);
        return result;
      }),
    );
  });
  router.post('/users/:id/password', permit('users.administer'), checkCsrf, async (req, res) => {
    const id = idSchema.parse(req.params.id),
      v = passwordResetSchema.parse(req.body),
      actor = (res.locals.identity as Identity).user.id,
      pw = await hashPassword(v.password);
    res.json(
      await transaction(pool, async (db) => {
        await adminLock(db, actor);
        await locked(db, id, v.row_version);
        await db.execute(
          'UPDATE users SET password_hash=?,row_version=row_version+1 WHERE user_id=?',
          [pw, id],
        );
        await db.execute(
          'UPDATE sessions SET revoked_at=UTC_TIMESTAMP(6) WHERE user_id=? AND revoked_at IS NULL',
          [id],
        );
        await audit(
          db,
          actor,
          'users.password_reset',
          id,
          null,
          { password_reset: true, sessions_revoked: true },
          res.locals.requestId,
        );
        return userRecord(db, id);
      }),
    );
  });
  router.get('/audit-logs', permit('audit.view'), async (req, res) => {
    const q = reportFilterSchema.parse(req.query);
    if (q.status)
      throw new ApiError(
        422,
        'VALIDATION_ERROR',
        'Use the audit search rather than a status filter.',
      );
    res.json(
      await transaction(pool, async (db) => {
        const where =
          "a.created_at>=? AND a.created_at<DATE_ADD(?,INTERVAL 1 DAY) AND (a.action LIKE ? ESCAPE '!' OR a.entity_type LIKE ? ESCAPE '!' OR u.name LIKE ? ESCAPE '!')";
        const args = [q.date_from, q.date_to, ...Array(3).fill(like(q.search))];
        const [count] = await db.query<RowDataPacket[]>(
          `SELECT COUNT(*) n FROM audit_logs a LEFT JOIN users u ON u.user_id=a.actor_id WHERE ${where}`,
          args,
        );
        const [items] = await db.query<RowDataPacket[]>(
          `SELECT CAST(a.audit_id AS CHAR) id,a.created_at,u.name actor,a.action,a.entity_type,CAST(a.entity_id AS CHAR) entity_id,a.before_values,a.after_values,a.http_request_id FROM audit_logs a LEFT JOIN users u ON u.user_id=a.actor_id WHERE ${where} ORDER BY a.created_at DESC,a.audit_id DESC LIMIT ? OFFSET ?`,
          [...args, q.pageSize, (q.page - 1) * q.pageSize],
        );
        return { items, total: Number(count[0].n), page: q.page, pageSize: q.pageSize };
      }),
    );
  });
  router.get('/system', permit('settings.administer'), async (_req, res) => {
    const state = await read(pool, async (db) => {
      const [r] = await db.query<RowDataPacket[]>(
        'SELECT COUNT(*) total,COALESCE(SUM(discrepancy<>0),0) discrepancies FROM v_account_reconciliation',
      );
      return { accounts: Number(r[0].total), discrepancies: Number(r[0].discrepancies) };
    });
    res.json({
      currency: 'INR',
      recordTimezone: 'UTC',
      sessionHours: 8,
      payrollMode: 'Internal academic processing; no external payments',
      ...state,
    });
  });
  return router;
}
