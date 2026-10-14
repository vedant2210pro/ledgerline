import { Router } from 'express';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import {
  idSchema,
  listSchema,
  historySchema,
  postingSchema,
  transferSchema,
  reversalSchema,
  payrollSchema,
  payrollUpdateSchema,
  payrollAmountsSchema,
  workflowSchema,
  processPayrollSchema,
  cents,
  decimal,
} from '@ledgerline/shared';
import { read, transaction } from './db.ts';
import { checkCsrf, permit, type Identity } from './auth.ts';
import { ApiError } from './errors.ts';
const like = (s: string) => '%' + s.replace(/[!%_]/g, (c) => '!' + c) + '%';
const asItems = (rows: RowDataPacket[]) =>
  rows.map((r) => ({ ...r, id: String(r.id), row_version: Number(r.row_version || 0) }));
async function audit(
  db: PoolConnection,
  actor: string,
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
      'payroll.' + action,
      'payroll_records',
      id,
      before ? JSON.stringify(before) : null,
      JSON.stringify(after),
      requestId,
    ],
  );
}
const payrollSelect =
  'p.*,CAST(p.payroll_id AS CHAR) AS id,e.name AS employee_name,e.employee_code';
async function payrollRecord(db: PoolConnection, id: string) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT ${payrollSelect} FROM payroll_records p JOIN employees e ON e.employee_id=p.employee_id WHERE p.payroll_id=?`,
    [id],
  );
  if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Payroll record not found.');
  return asItems(rows)[0];
}
async function activeEmployee(db: PoolConnection, id: string) {
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT employment_status FROM employees WHERE employee_id=? FOR SHARE',
    [id],
  );
  if (rows[0]?.employment_status !== 'active')
    throw new ApiError(
      409,
      'EMPLOYEE_UNAVAILABLE',
      'Payroll requires an active employee with complete employment details.',
    );
}
// Public procedure names are constants. Calls own their transaction: never wrap these in transaction().
async function call(pool: Pool, name: string, values: unknown[]) {
  return read(pool, async (db) => {
    let sets: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        [sets] = await db.query(`CALL ${name}(${values.map(() => '?').join(',')})`, values);
        break;
      } catch (e) {
        const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
        // The procedure handler rolls back before rethrowing these errors. Never retry unknown commit outcomes with a new key.
        if (attempt === 2 || !['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(code)) throw e;
      }
    }
    const result = (sets as unknown as RowDataPacket[][])[0]?.[0];
    if (!result)
      throw new ApiError(
        500,
        'MISSING_RECEIPT',
        'The result could not be read. Retry with the same request key.',
      );
    return {
      reference_number: String(result.reference_number),
      replayed: Number(result.replayed) === 1,
    };
  });
}
export function financeRouter(pool: Pool) {
  const router = Router();
  router.get('/lookups/posting/:kind', permit('transactions.view'), async (req, res) => {
    const q = listSchema.parse(req.query),
      kind = req.params.kind;
    if (!['accounts', 'branches'].includes(String(kind)))
      throw new ApiError(404, 'NOT_FOUND', 'Lookup not found.');
    const rows = await read(pool, async (db) => {
      const [r] = await db.execute<RowDataPacket[]>(
        kind === 'accounts'
          ? "SELECT CAST(a.account_id AS CHAR) id,a.account_number name,CONCAT(c.name,' · INR ',a.balance) detail FROM accounts a JOIN customers c ON c.customer_id=a.customer_id WHERE a.account_status='active' AND (a.account_number LIKE ? ESCAPE '!' OR c.name LIKE ? ESCAPE '!') ORDER BY a.account_id DESC LIMIT 50"
          : "SELECT CAST(branch_id AS CHAR) id,name,branch_code detail FROM branches WHERE branch_status='active' AND (name LIKE ? ESCAPE '!' OR branch_code LIKE ? ESCAPE '!') ORDER BY name LIMIT 50",
        [like(q.search), like(q.search)],
      );
      return r;
    });
    res.json({ items: rows });
  });
  router.get('/transactions', permit('transactions.view'), async (req, res) => {
    const q = historySchema.parse(req.query),
      where = ['1=1'],
      values: unknown[] = [];
    if (q.status) {
      if (
        ![
          'deposit',
          'withdrawal',
          'transfer_debit',
          'transfer_credit',
          'reversal_debit',
          'reversal_credit',
        ].includes(q.status)
      )
        throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid transaction type.');
      where.push('t.transaction_type=?');
      values.push(q.status);
    }
    if (q.search) {
      where.push("(t.reference_number LIKE ? ESCAPE '!' OR a.account_number LIKE ? ESCAPE '!')");
      values.push(like(q.search), like(q.search));
    }
    if (q.account_id) {
      where.push('t.account_id=?');
      values.push(q.account_id);
    }
    if (q.date_from) {
      where.push('t.transaction_date>=?');
      values.push(q.date_from);
    }
    if (q.date_to) {
      where.push('t.transaction_date<DATE_ADD(?,INTERVAL 1 DAY)');
      values.push(q.date_to);
    }
    res.json(
      await transaction(pool, async (db) => {
        const from = 'banking_transactions t JOIN accounts a ON a.account_id=t.account_id';
        const [total] = await db.query<RowDataPacket[]>(
          `SELECT COUNT(*) n FROM ${from} WHERE ${where.join(' AND ')}`,
          values,
        );
        const [rows] = await db.query<RowDataPacket[]>(
          `SELECT t.*,CAST(t.transaction_id AS CHAR) id,a.account_number,(SELECT r.reference_number FROM banking_transactions r WHERE r.reversal_of_transaction_id=t.transaction_id) reversed_by_reference FROM ${from} WHERE ${where.join(' AND ')} ORDER BY t.transaction_date DESC,t.transaction_id DESC LIMIT ? OFFSET ?`,
          [...values, q.pageSize, (q.page - 1) * q.pageSize],
        );
        return {
          items: asItems(rows),
          total: Number(total[0].n),
          page: q.page,
          pageSize: q.pageSize,
        };
      }),
    );
  });
  for (const operation of ['deposit', 'withdrawal', 'transfer'] as const) {
    router.post(
      '/transactions/' + operation,
      permit('transactions.process'),
      checkCsrf,
      async (req, res) => {
        const v =
          operation === 'transfer' ? transferSchema.parse(req.body) : postingSchema.parse(req.body);
        const actor = (res.locals.identity as Identity).user.id;
        const values = [
          actor,
          v.idempotency_key,
          v.account_id,
          ...('destination_account_id' in v ? [v.destination_account_id] : []),
          v.branch_id,
          decimal(cents(v.amount)),
          v.description,
        ];
        const result = await call(
          pool,
          operation === 'deposit'
            ? 'sp_deposit_money'
            : operation === 'withdrawal'
              ? 'sp_withdraw_money'
              : 'sp_transfer_money',
          values,
        );
        res.status(result.replayed ? 200 : 201).json(result);
      },
    );
  }
  router.post(
    '/transactions/:id/reverse',
    permit('transactions.reverse'),
    checkCsrf,
    async (req, res) => {
      const id = idSchema.parse(req.params.id),
        v = reversalSchema.parse(req.body),
        actor = (res.locals.identity as Identity).user.id;
      const result = await call(pool, 'sp_reverse_transaction', [
        actor,
        v.idempotency_key,
        id,
        v.branch_id,
        v.reason,
      ]);
      res.status(result.replayed ? 200 : 201).json(result);
    },
  );
  router.post('/payroll/preview', permit('payroll.create'), checkCsrf, async (req, res) => {
    const v = payrollAmountsSchema.parse(req.body);
    res.json(
      await read(pool, async (db) => {
        const [rows] = await db.execute<RowDataPacket[]>(
          'SELECT CAST(? AS DECIMAL(18,2))+CAST(? AS DECIMAL(18,2)) gross_salary,calculate_net_salary(?,?,?) net_salary',
          [v.salary_amount, v.bonus, v.salary_amount, v.bonus, v.deductions],
        );
        return rows[0];
      }),
    );
  });
  router.get('/payroll/summary', permit('reports.payroll.view'), async (req, res) => {
    const q = listSchema.parse(req.query);
    res.json(
      await read(pool, async (db) => {
        const [rows] = await db.query<RowDataPacket[]>(
          'SELECT * FROM v_monthly_payroll ORDER BY payroll_period DESC,payroll_status LIMIT ? OFFSET ?',
          [q.pageSize, (q.page - 1) * q.pageSize],
        );
        const [total] = await db.query<RowDataPacket[]>('SELECT COUNT(*) n FROM v_monthly_payroll');
        return { items: rows, total: Number(total[0].n), page: q.page, pageSize: q.pageSize };
      }),
    );
  });
  router.get('/payroll', permit('payroll.view'), async (req, res) => {
    const q = listSchema.parse(req.query);
    if (
      q.status &&
      !['draft', 'pending_approval', 'approved', 'rejected', 'processed', 'failed'].includes(
        q.status,
      )
    )
      throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid payroll status.');
    const where =
      "(e.name LIKE ? ESCAPE '!' OR e.employee_code LIKE ? ESCAPE '!') AND (?='' OR p.payroll_status=?)";
    const values = [like(q.search), like(q.search), q.status, q.status];
    res.json(
      await transaction(pool, async (db) => {
        const [count] = await db.query<RowDataPacket[]>(
          `SELECT COUNT(*) n FROM payroll_records p JOIN employees e ON e.employee_id=p.employee_id WHERE ${where}`,
          values,
        );
        const [rows] = await db.query<RowDataPacket[]>(
          `SELECT ${payrollSelect} FROM payroll_records p JOIN employees e ON e.employee_id=p.employee_id WHERE ${where} ORDER BY p.payroll_period DESC,p.payroll_id DESC LIMIT ? OFFSET ?`,
          [...values, q.pageSize, (q.page - 1) * q.pageSize],
        );
        return {
          items: asItems(rows),
          total: Number(count[0].n),
          page: q.page,
          pageSize: q.pageSize,
        };
      }),
    );
  });
  router.get('/payroll/:id/audit', permit('payroll.view'), async (req, res) => {
    const id = idSchema.parse(req.params.id),
      q = listSchema.parse(req.query);
    res.json(
      await read(pool, async (db) => {
        await payrollRecord(db, id);
        const [rows] = await db.query<RowDataPacket[]>(
          "SELECT CAST(a.audit_id AS CHAR) id,a.action,a.created_at,u.name AS actor_name,a.before_values,a.after_values FROM audit_logs a LEFT JOIN users u ON u.user_id=a.actor_id WHERE a.entity_type='payroll_records' AND a.entity_id=? ORDER BY a.audit_id DESC LIMIT ? OFFSET ?",
          [id, q.pageSize, (q.page - 1) * q.pageSize],
        );
        const [total] = await db.execute<RowDataPacket[]>(
          "SELECT COUNT(*) n FROM audit_logs WHERE entity_type='payroll_records' AND entity_id=?",
          [id],
        );
        return { items: rows, total: Number(total[0].n), page: q.page, pageSize: q.pageSize };
      }),
    );
  });
  router.get('/payroll/:id', permit('payroll.view'), async (req, res) =>
    res.json(await read(pool, (db) => payrollRecord(db, idSchema.parse(req.params.id)))),
  );
  router.post('/payroll', permit('payroll.create'), checkCsrf, async (req, res) => {
    const v = payrollSchema.parse(req.body),
      actor = (res.locals.identity as Identity).user.id;
    res.status(201).json(
      await transaction(pool, async (db) => {
        await activeEmployee(db, v.employee_id);
        await db.execute(
          'INSERT INTO payroll_records(employee_id,payroll_period,salary_amount,bonus,deductions,gross_salary,net_salary,created_by) VALUES (?,?,?,?,?,CAST(? AS DECIMAL(18,2))+CAST(? AS DECIMAL(18,2)),calculate_net_salary(?,?,?),?)',
          [
            v.employee_id,
            v.payroll_period,
            v.salary_amount,
            v.bonus,
            v.deductions,
            v.salary_amount,
            v.bonus,
            v.salary_amount,
            v.bonus,
            v.deductions,
            actor,
          ],
        );
        const [last] = await db.query<RowDataPacket[]>('SELECT CAST(LAST_INSERT_ID() AS CHAR) id');
        const result = await payrollRecord(db, String(last[0].id));
        await audit(db, actor, result.id, 'create', null, result, res.locals.requestId);
        return result;
      }),
    );
  });
  router.patch('/payroll/:id', permit('payroll.update'), checkCsrf, async (req, res) => {
    const v = payrollUpdateSchema.parse(req.body),
      id = idSchema.parse(req.params.id),
      actor = (res.locals.identity as Identity).user.id;
    res.json(
      await transaction(pool, async (db) => {
        const [rows] = await db.execute<RowDataPacket[]>(
          'SELECT * FROM payroll_records WHERE payroll_id=? FOR UPDATE',
          [id],
        );
        if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Payroll record not found.');
        const current = rows[0];
        if (!['draft', 'rejected'].includes(current.payroll_status))
          throw new ApiError(
            409,
            'PAYROLL_LOCKED',
            'Only draft or rejected payroll can be edited.',
          );
        if (Number(current.row_version) !== v.row_version)
          throw new ApiError(409, 'STALE_RECORD', 'Payroll changed. Reload before editing.');
        await activeEmployee(db, v.employee_id);
        // Every editor becomes the preparer, preventing a reviewer from editing then self-approving.
        await db.execute(
          "UPDATE payroll_records SET employee_id=?,payroll_period=?,salary_amount=?,bonus=?,deductions=?,gross_salary=CAST(? AS DECIMAL(18,2))+CAST(? AS DECIMAL(18,2)),net_salary=calculate_net_salary(?,?,?),payroll_status='draft',created_by=?,approved_by=NULL,approved_at=NULL,rejection_reason=NULL,row_version=row_version+1 WHERE payroll_id=?",
          [
            v.employee_id,
            v.payroll_period,
            v.salary_amount,
            v.bonus,
            v.deductions,
            v.salary_amount,
            v.bonus,
            v.salary_amount,
            v.bonus,
            v.deductions,
            actor,
            id,
          ],
        );
        const result = await payrollRecord(db, id);
        await audit(db, actor, id, 'update', current, result, res.locals.requestId);
        return result;
      }),
    );
  });
  for (const action of ['submit', 'approve', 'reject'] as const) {
    router.post(
      '/payroll/:id/' + action,
      permit(action === 'submit' ? 'payroll.update' : 'payroll.approve'),
      checkCsrf,
      async (req, res) => {
        const id = idSchema.parse(req.params.id),
          v = workflowSchema.parse(req.body),
          actor = (res.locals.identity as Identity).user.id;
        res.json(
          await transaction(pool, async (db) => {
            const [rows] = await db.execute<RowDataPacket[]>(
              'SELECT * FROM payroll_records WHERE payroll_id=? FOR UPDATE',
              [id],
            );
            if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Payroll record not found.');
            const current = rows[0];
            if (Number(current.row_version) !== v.row_version)
              throw new ApiError(409, 'STALE_RECORD', 'Payroll changed. Reload before continuing.');
            if (current.payroll_status !== (action === 'submit' ? 'draft' : 'pending_approval'))
              throw new ApiError(
                409,
                'INVALID_TRANSITION',
                'This action is not available in the current payroll state.',
              );
            if (action !== 'submit' && String(current.created_by) === actor)
              throw new ApiError(
                403,
                'INDEPENDENT_REVIEW',
                'Another authorized person must review this payroll.',
              );
            if (action === 'reject' && !v.reason)
              throw new ApiError(422, 'REASON_REQUIRED', 'Enter a rejection reason.');
            if (action !== 'reject') await activeEmployee(db, String(current.employee_id));
            if (action === 'approve')
              await db.execute(
                "UPDATE payroll_records SET payroll_status='approved',approved_by=?,approved_at=UTC_TIMESTAMP(6),row_version=row_version+1 WHERE payroll_id=?",
                [actor, id],
              );
            else
              await db.execute(
                'UPDATE payroll_records SET payroll_status=?,rejection_reason=?,row_version=row_version+1 WHERE payroll_id=?',
                [
                  action === 'submit' ? 'pending_approval' : 'rejected',
                  action === 'reject' ? (v.reason ?? null) : null,
                  id,
                ],
              );
            const result = await payrollRecord(db, id);
            await audit(db, actor, id, action, current, result, res.locals.requestId);
            return result;
          }),
        );
      },
    );
  }
  router.post('/payroll/:id/process', permit('payroll.process'), checkCsrf, async (req, res) => {
    const id = idSchema.parse(req.params.id),
      v = processPayrollSchema.parse(req.body),
      actor = (res.locals.identity as Identity).user.id;
    const result = await call(pool, 'sp_process_payroll', [
      actor,
      v.idempotency_key,
      id,
      v.description,
    ]);
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.delete('/payroll/:id', permit('payroll.update'), checkCsrf, () => {
    throw new ApiError(
      405,
      'HISTORY_PRESERVED',
      'Payroll history is retained. Edit a draft or reject submitted payroll.',
    );
  });
  return router;
}
