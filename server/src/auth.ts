import { Router, type Request, type RequestHandler } from 'express';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { loginSchema, type User } from '@ledgerline/shared';
import type { AppConfig } from './config.ts';
import { read, transaction } from './db.ts';
import { ApiError } from './errors.ts';
import { hash, hmac, csrf, token, verifyPassword, dummyHash, safeEqual } from './crypto.ts';
const lifetimeMs = 8 * 60 * 60 * 1000;
export type Identity = { user: User; sessionId: string; rawToken: string; csrfHash: Buffer };
export function cookieName(c: AppConfig) {
  return c.production ? '__Host-ledgerline' : 'ledgerline_session';
}
export function sessionToken(req: Request, c: AppConfig) {
  const cookies = (req.headers.cookie || '').split(';').map((v) => v.trim().split('='));
  const value = cookies.find(([k]) => k === cookieName(c))?.[1] || '';
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
}
async function userContract(db: PoolConnection, id: string): Promise<User> {
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT user_id,name,email FROM users WHERE user_id=?',
    [id],
  );
  const [roles] = await db.execute<RowDataPacket[]>(
    'SELECT r.role_name FROM user_roles ur JOIN roles r USING(role_id) WHERE ur.user_id=? ORDER BY r.role_name',
    [id],
  );
  const [permissions] = await db.execute<RowDataPacket[]>(
    'SELECT DISTINCT p.permission_code FROM user_roles ur JOIN role_permissions rp USING(role_id) JOIN permissions p USING(permission_id) WHERE ur.user_id=? ORDER BY p.permission_code',
    [id],
  );
  return {
    id: String(rows[0].user_id),
    name: rows[0].name,
    email: rows[0].email,
    roles: roles.map((r) => r.role_name),
    permissions: permissions.map((r) => r.permission_code),
  };
}
export function authenticate(pool: Pool, c: AppConfig): RequestHandler {
  return async (req, res, next) => {
    const raw = sessionToken(req, c);
    if (!raw) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    res.locals.identity = await read(pool, async (db) => {
      const [sessions] = await db.execute<RowDataPacket[]>(
        `SELECT s.session_id,s.user_id,s.csrf_token_hash FROM sessions s JOIN users u USING(user_id) WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(6) AND s.revoked_at IS NULL AND u.account_status='active'`,
        [hash(raw)],
      );
      if (!sessions.length)
        throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has ended. Please sign in again.');
      const s = sessions[0];
      return {
        user: await userContract(db, String(s.user_id)),
        sessionId: String(s.session_id),
        rawToken: raw,
        csrfHash: s.csrf_token_hash,
      } satisfies Identity;
    });
    next();
  };
}
export function permit(permission: string): RequestHandler {
  return (_req, res, next) => {
    const identity = res.locals.identity as Identity;
    if (!identity.user.permissions.includes(permission))
      throw new ApiError(403, 'FORBIDDEN', 'Your role does not allow this action.');
    next();
  };
}
export const checkCsrf: RequestHandler = (req, res, next) => {
  const identity = res.locals.identity as Identity;
  const supplied = req.get('X-CSRF-Token') || '';
  if (!safeEqual(hash(supplied), identity.csrfHash))
    throw new ApiError(
      403,
      'CSRF_INVALID',
      'Your session verification failed. Reload and try again.',
    );
  next();
};
async function throttle(pool: Pool, c: AppConfig, email: string, address: string) {
  const subjects = [
    { kind: 'identity', value: email, max: 5 },
    { kind: 'address', value: address, max: 30 },
  ]
    .map((s) => ({ ...s, key: hmac(c.secret, s.kind + ':' + s.value) }))
    .sort((a, b) => a.kind.localeCompare(b.kind));
  const allowed = await transaction(pool, async (db) => {
    // Check the address first so exhausted IPs cannot create unlimited identity buckets.
    for (const s of subjects) {
      await db.execute(
        `INSERT INTO login_throttles(subject_hash) VALUES (?) ON DUPLICATE KEY UPDATE attempt_count=IF(window_start<=UTC_TIMESTAMP(6)-INTERVAL 15 MINUTE,1,LEAST(attempt_count+1,1000000)),window_start=IF(window_start<=UTC_TIMESTAMP(6)-INTERVAL 15 MINUTE,UTC_TIMESTAMP(6),window_start)`,
        [s.key],
      );
      const [r] = await db.execute<RowDataPacket[]>(
        'SELECT attempt_count FROM login_throttles WHERE subject_hash=?',
        [s.key],
      );
      if (Number(r[0].attempt_count) > s.max) return false;
    }
    return true;
  });
  if (!allowed)
    throw new ApiError(429, 'LOGIN_LIMIT', 'Too many sign-in attempts. Try again in 15 minutes.');
  return subjects;
}
export function authRouter(pool: Pool, c: AppConfig) {
  const router = Router();
  const auth = authenticate(pool, c);
  router.post('/login', async (req, res) => {
    const input = loginSchema.parse(req.body);
    const subjects = await throttle(pool, c, input.email, req.ip || 'unknown');
    const user = await read(pool, async (db) => {
      const [r] = await db.execute<RowDataPacket[]>(
        'SELECT user_id,password_hash,account_status FROM users WHERE email=?',
        [input.email],
      );
      return r[0];
    });
    const matches = await verifyPassword(input.password, user?.password_hash || dummyHash);
    const allowed = matches && user?.account_status === 'active';
    await transaction(pool, async (db) => {
      for (const s of subjects)
        await db.execute(
          'INSERT INTO login_attempts(subject_hash,attempt_kind,was_successful) VALUES (?,?,?)',
          [s.key, s.kind, allowed ? 1 : 0],
        );
    });
    if (!allowed) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    const raw = token(),
      csrfToken = csrf(c.secret, raw);
    const identity = await transaction(pool, async (db) => {
      const [fresh] = await db.execute<RowDataPacket[]>(
        'SELECT password_hash,account_status FROM users WHERE user_id=? FOR SHARE',
        [user.user_id],
      );
      if (fresh[0].account_status !== 'active' || fresh[0].password_hash !== user.password_hash)
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      const old = sessionToken(req, c);
      if (old)
        await db.execute(
          'UPDATE sessions SET revoked_at=UTC_TIMESTAMP(6) WHERE token_hash=? AND revoked_at IS NULL',
          [hash(old)],
        );
      const [insert] = await db.execute<ResultSetHeader>(
        'INSERT INTO sessions(user_id,token_hash,csrf_token_hash,expires_at) VALUES (?,?,?,UTC_TIMESTAMP(6)+INTERVAL 8 HOUR)',
        [user.user_id, hash(raw), hash(csrfToken)],
      );
      await db.execute(
        "INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,http_request_id) VALUES (?,'auth.login','sessions',?,?)",
        [user.user_id, insert.insertId, res.locals.requestId],
      );
      return userContract(db, String(user.user_id));
    });
    res.cookie(cookieName(c), raw, {
      httpOnly: true,
      secure: c.production,
      sameSite: 'lax',
      path: '/',
      maxAge: lifetimeMs,
    });
    res.json({ user: identity, csrfToken });
  });
  router.get('/me', auth, (req, res) => {
    const identity = res.locals.identity as Identity;
    res.json({ user: identity.user, csrfToken: csrf(c.secret, sessionToken(req, c)) });
  });
  router.post('/logout', auth, checkCsrf, async (_req, res) => {
    const identity = res.locals.identity as Identity;
    await transaction(pool, async (db) => {
      await db.execute(
        'UPDATE sessions SET revoked_at=UTC_TIMESTAMP(6) WHERE session_id=? AND revoked_at IS NULL',
        [identity.sessionId],
      );
      await db.execute(
        "INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,http_request_id) VALUES (?,'auth.logout','sessions',?,?)",
        [identity.user.id, identity.sessionId, res.locals.requestId],
      );
    });
    res.clearCookie(cookieName(c), {
      httpOnly: true,
      secure: c.production,
      sameSite: 'lax',
      path: '/',
    });
    res.status(204).end();
  });
  return router;
}
