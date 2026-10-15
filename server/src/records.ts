import { Router } from 'express';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { randomBytes } from 'node:crypto';
import {
  employeeSchema,
  employeeUpdateSchema,
  idSchema,
  listSchema,
  customerSchema,
  branchSchema,
  accountSchema,
  customerUpdateSchema,
  branchUpdateSchema,
  accountUpdateSchema,
  type Module,
  type RecordItem,
} from '@ledgerline/shared';
import { read, transaction } from './db.ts';
import { ApiError } from './errors.ts';
import { permit, checkCsrf, type Identity } from './auth.ts';
const specs = {
  employees: {
    pk: 'employee_id',
    alias: 'e',
    from: 'employees e',
    select:
      'e.employee_id AS id,e.employee_code,e.name,e.department,e.phone,e.email,e.designation,e.date_of_joining,e.employment_status,e.row_version',
    search: ['e.name', 'e.employee_code', 'e.department'],
    status: 'employment_status',
    statuses: ['active', 'on_leave', 'inactive', 'legacy_incomplete'],
  },
  customers: {
    pk: 'customer_id',
    alias: 'c',
    from: 'customers c',
    select:
      'c.customer_id AS id,c.name,c.email,c.phone,c.address,c.customer_status,c.row_version,(SELECT COUNT(*) FROM accounts a WHERE a.customer_id=c.customer_id) AS account_count',
    search: ['c.name', 'c.email', 'c.phone'],
    status: 'customer_status',
    statuses: ['active', 'inactive'],
  },
  branches: {
    pk: 'branch_id',
    alias: 'b',
    from: 'branches b',
    select:
      'b.branch_id AS id,b.branch_code,b.name,b.address,b.phone,b.branch_status,b.row_version',
    search: ['b.name', 'b.branch_code', 'b.address'],
    status: 'branch_status',
    statuses: ['active', 'inactive'],
  },
  accounts: {
    pk: 'account_id',
    alias: 'a',
    from: 'accounts a JOIN customers c ON c.customer_id=a.customer_id JOIN employees e ON e.employee_id=a.employee_id LEFT JOIN account_opening_snapshots s ON s.account_id=a.account_id',
    select:
      'a.account_id AS id,a.account_number,a.customer_id,a.employee_id,a.account_type,a.currency,a.balance,a.open_date,a.account_status,a.row_version,c.name AS customer_name,e.name AS employee_name,e.employment_status,s.reconciliation_state',
    search: ['a.account_number', 'c.name', 'e.name'],
    status: 'account_status',
    statuses: ['active', 'frozen', 'closed'],
  },
} as const;
function item(row: RowDataPacket): RecordItem {
  return {
    ...Object.fromEntries(Object.entries(row)),
    id: String(row.id),
    row_version: Number(row.row_version),
  };
}
const like = (s: string) => '%' + s.replace(/[!%_]/g, (c) => '!' + c) + '%';
async function fetchRecord(db: PoolConnection, module: Module, id: string) {
  const s = specs[module];
  const [r] = await db.execute<RowDataPacket[]>(
    `SELECT ${s.select} FROM ${s.from} WHERE ${s.alias}.${s.pk}=?`,
    [id],
  );
  if (!r.length) throw new ApiError(404, 'NOT_FOUND', 'This record could not be found.');
  return item(r[0]);
}
async function audit(
  db: PoolConnection,
  actor: string,
  module: Module,
  id: string,
  action: string,
  before: unknown,
  after: unknown,
  requestId: string,
) {
  await db.execute(
    'INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,before_values,after_values,http_request_id) VALUES (?,?,?,?,?,?,?)',
    [
      actor,
      `${module}.${action}`,
      module,
      id,
      before ? JSON.stringify(before) : null,
      JSON.stringify(after),
      requestId,
    ],
  );
}
async function relationships(db: PoolConnection, customer: string, employee: string) {
  // Customer first, then employee: a common order for create/activation/reassignment.
  const [c] = await db.execute<RowDataPacket[]>(
    'SELECT customer_status FROM customers WHERE customer_id=? FOR SHARE',
    [customer],
  );
  if (!c.length || c[0].customer_status !== 'active')
    throw new ApiError(409, 'CUSTOMER_INACTIVE', 'Choose an active customer.');
  const [e] = await db.execute<RowDataPacket[]>(
    'SELECT employment_status FROM employees WHERE employee_id=? FOR SHARE',
    [employee],
  );
  if (!e.length || !['active', 'legacy_incomplete'].includes(e[0].employment_status))
    throw new ApiError(409, 'EMPLOYEE_UNAVAILABLE', 'Choose an available account officer.');
}
export function recordsRouter(pool: Pool) {
  const router = Router();
  router.get('/lookups/customers', permit('accounts.create'), async (req, res) => {
    const input = listSchema.parse(req.query);
    const rows = await read(pool, async (db) => {
      const [r] = await db.execute<RowDataPacket[]>(
        "SELECT customer_id AS id,name,email AS detail FROM customers WHERE customer_status='active' AND (name LIKE ? ESCAPE '!' OR email LIKE ? ESCAPE '!') ORDER BY name,customer_id LIMIT 50",
        [like(input.search), like(input.search)],
      );
      return r;
    });
    res.json({ items: rows.map((r) => ({ ...r, id: String(r.id) })) });
  });
  router.get('/lookups/employees', async (req, res) => {
    const identity = res.locals.identity as Identity;
    if (
      !['accounts.create', 'accounts.update', 'payroll.create', 'payroll.update'].some((p) =>
        identity.user.permissions.includes(p),
      )
    )
      throw new ApiError(403, 'FORBIDDEN', 'Your role does not allow this action.');
    const input = listSchema.parse(req.query);
    const rows = await read(pool, async (db) => {
      const [r] = await db.execute<RowDataPacket[]>(
        "SELECT employee_id AS id,name,CONCAT(employee_code,' · ',employment_status) AS detail FROM employees WHERE employment_status IN ('active','legacy_incomplete') AND name LIKE ? ESCAPE '!' ORDER BY name,employee_id LIMIT 50",
        [like(input.search)],
      );
      return r;
    });
    res.json({ items: rows.map((r) => ({ ...r, id: String(r.id) })) });
  });
  router.get(
    '/customers/:id/accounts',
    permit('customers.view'),
    permit('accounts.view'),
    async (req, res) => {
      const id = idSchema.parse(req.params.id),
        q = listSchema.parse(req.query),
        s = specs.accounts;
      const result = await read(pool, async (db) => {
        await fetchRecord(db, 'customers', id);
        const [rows] = await db.query<RowDataPacket[]>(
          `SELECT ${s.select} FROM ${s.from} WHERE a.customer_id=? ORDER BY a.account_id DESC LIMIT ? OFFSET ?`,
          [id, q.pageSize, (q.page - 1) * q.pageSize],
        );
        const [total] = await db.execute<RowDataPacket[]>(
          'SELECT COUNT(*) total FROM accounts WHERE customer_id=?',
          [id],
        );
        return {
          items: rows.map(item),
          total: Number(total[0].total),
          page: q.page,
          pageSize: q.pageSize,
        };
      });
      res.json(result);
    },
  );
  for (const module of ['customers', 'accounts', 'branches', 'employees'] as const) {
    const s = specs[module];
    router.get('/' + module, permit(module + '.view'), async (req, res) => {
      const q = listSchema.parse(req.query);
      if (q.status && !(s.statuses as readonly string[]).includes(q.status))
        throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a valid status filter.');
      const where = [
        q.search ? '(' + s.search.map((k) => `${k} LIKE ? ESCAPE '!'`).join(' OR ') + ')' : '1=1',
      ];
      const values: unknown[] = q.search ? s.search.map(() => like(q.search)) : [];
      if (q.status) {
        where.push(`${s.alias}.${s.status}=?`);
        values.push(q.status);
      }
      const result = await read(pool, async (db) => {
        // A read transaction keeps count and page consistent within this response.
        await db.beginTransaction();
        try {
          const [count] = await db.query<RowDataPacket[]>(
            `SELECT COUNT(*) total FROM ${s.from} WHERE ${where.join(' AND ')}`,
            values,
          );
          const [rows] = await db.query<RowDataPacket[]>(
            `SELECT ${s.select} FROM ${s.from} WHERE ${where.join(' AND ')} ORDER BY ${s.alias}.${s.pk} DESC LIMIT ? OFFSET ?`,
            [...values, q.pageSize, (q.page - 1) * q.pageSize],
          );
          await db.commit();
          return {
            items: rows.map(item),
            total: Number(count[0].total),
            page: q.page,
            pageSize: q.pageSize,
          };
        } catch (e) {
          await db.rollback();
          throw e;
        }
      });
      res.json(result);
    });
    router.get('/' + module + '/:id', permit(module + '.view'), async (req, res) => {
      const id = idSchema.parse(req.params.id);
      res.json(await read(pool, (db) => fetchRecord(db, module, id)));
    });
    router.post('/' + module, permit(module + '.create'), checkCsrf, async (req, res) => {
      const actor = (res.locals.identity as Identity).user.id;
      const data =
        module === 'employees'
          ? employeeSchema.parse(req.body)
          : module === 'customers'
            ? customerSchema.parse(req.body)
            : module === 'branches'
              ? branchSchema.parse(req.body)
              : accountSchema.parse(req.body);
      const created = await transaction(pool, async (db) => {
        let insert: ResultSetHeader;
        if (
          module === 'employees' &&
          'date_of_joining' in data &&
          data.date_of_joining > new Date().toISOString().slice(0, 10)
        )
          throw new ApiError(422, 'FUTURE_DATE', 'Joining date cannot be in the future.');
        if (module === 'accounts') {
          const a = accountSchema.parse(data);
          if (a.open_date > new Date().toISOString().slice(0, 10))
            throw new ApiError(422, 'FUTURE_DATE', 'The opening date cannot be in the future.');
          await relationships(db, a.customer_id, a.employee_id);
          [insert] = await db.execute<ResultSetHeader>(
            'INSERT INTO accounts(account_number,customer_id,employee_id,account_type,open_date) VALUES (?,?,?,?,?)',
            [
              'LL' + randomBytes(8).toString('hex').toUpperCase(),
              a.customer_id,
              a.employee_id,
              a.account_type,
              a.open_date,
            ],
          );
        } else {
          const keys = Object.keys(data);
          [insert] = await db.execute<ResultSetHeader>(
            `INSERT INTO ${module}(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
            Object.values(data),
          );
        }
        // LAST_INSERT_ID is selected as a string to avoid unsafe JS integer conversion.
        const [last] = await db.query<RowDataPacket[]>('SELECT CAST(LAST_INSERT_ID() AS CHAR) id');
        if (!insert.affectedRows)
          throw new ApiError(500, 'INSERT_FAILED', 'The record could not be created.');
        const result = await fetchRecord(db, module, String(last[0].id));
        await audit(db, actor, module, result.id, 'create', null, result, res.locals.requestId);
        return result;
      });
      res.status(201).json(created);
    });
    router.patch('/' + module + '/:id', permit(module + '.update'), checkCsrf, async (req, res) => {
      const id = idSchema.parse(req.params.id),
        actor = (res.locals.identity as Identity).user.id;
      const data =
        module === 'employees'
          ? employeeUpdateSchema.parse(req.body)
          : module === 'customers'
            ? customerUpdateSchema.parse(req.body)
            : module === 'branches'
              ? branchUpdateSchema.parse(req.body)
              : accountUpdateSchema.parse(req.body);
      const result = await transaction(pool, async (db) => {
        const [locked] = await db.execute<RowDataPacket[]>(
          `SELECT * FROM ${module} WHERE ${s.pk}=? FOR UPDATE`,
          [id],
        );
        if (!locked.length) throw new ApiError(404, 'NOT_FOUND', 'This record could not be found.');
        const current = locked[0];
        if (Number(current.row_version) !== data.row_version)
          throw new ApiError(
            409,
            'STALE_RECORD',
            'This record changed since you opened it. Reload before saving.',
          );
        const before = await fetchRecord(db, module, id);
        if (module === 'employees') {
          const e = employeeUpdateSchema.parse(data);
          if (e.date_of_joining > new Date().toISOString().slice(0, 10))
            throw new ApiError(422, 'FUTURE_DATE', 'Joining date cannot be in the future.');
          if (e.employment_status === 'inactive') {
            const [linked] = await db.execute<RowDataPacket[]>(
              "SELECT account_id FROM accounts WHERE employee_id=? AND account_status<>'closed' LIMIT 1 FOR SHARE",
              [id],
            );
            if (linked.length)
              throw new ApiError(
                409,
                'ASSIGNED_ACCOUNTS',
                'Reassign or close this employee’s accounts before deactivation.',
              );
            const [pending] = await db.execute<RowDataPacket[]>(
              "SELECT payroll_id FROM payroll_records WHERE employee_id=? AND payroll_status IN ('pending_approval','approved') LIMIT 1 FOR SHARE",
              [id],
            );
            if (pending.length)
              throw new ApiError(
                409,
                'PENDING_PAYROLL',
                'Resolve pending or approved payroll before deactivation.',
              );
          }
        }
        if (
          module === 'customers' &&
          'customer_status' in data &&
          data.customer_status === 'inactive'
        ) {
          const [a] = await db.execute<RowDataPacket[]>(
            "SELECT account_id FROM accounts WHERE customer_id=? AND account_status<>'closed' LIMIT 1 FOR SHARE",
            [id],
          );
          if (a.length)
            throw new ApiError(
              409,
              'OPEN_ACCOUNTS',
              'Close this customer’s accounts before deactivating the customer.',
            );
        }
        if (module === 'accounts') {
          const a = accountUpdateSchema.parse(data);
          if (current.account_status === 'closed')
            throw new ApiError(
              409,
              'ACCOUNT_CLOSED',
              'Closed accounts are retained for history and cannot be changed.',
            );
          if (a.account_status === 'closed' && current.balance !== '0.00')
            throw new ApiError(
              409,
              'ACCOUNT_FUNDED',
              'An account must have a zero balance before closure.',
            );
          const [snapshots] = await db.execute<RowDataPacket[]>(
            'SELECT reconciliation_state FROM account_opening_snapshots WHERE account_id=? FOR SHARE',
            [id],
          );
          if (a.account_status !== 'frozen' && snapshots[0]?.reconciliation_state === 'pending')
            throw new ApiError(
              409,
              'RECONCILIATION_REQUIRED',
              'The imported opening balance needs review before changing this status.',
            );
          if (String(current.employee_id) !== a.employee_id || a.account_status === 'active')
            await relationships(db, String(current.customer_id), a.employee_id);
        }
        const entries = Object.entries(data).filter(([key]) => key !== 'row_version');
        await db.execute(
          `UPDATE ${module} SET ${entries.map(([k]) => k + '=?').join(',')},row_version=row_version+1 WHERE ${s.pk}=?`,
          [...entries.map(([, v]) => v), id],
        );
        const after = await fetchRecord(db, module, id);
        await audit(db, actor, module, id, 'update', before, after, res.locals.requestId);
        return after;
      });
      res.json(result);
    });
    router.delete('/' + module + '/:id', permit(module + '.update'), checkCsrf, () => {
      throw new ApiError(
        405,
        'HISTORY_PRESERVED',
        'Records are retained for history. Use permitted status changes instead.',
      );
    });
  }
  return router;
}
