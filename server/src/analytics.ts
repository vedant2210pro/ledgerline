import { Router } from 'express';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { reportFilterSchema, type ReportKind, type DashboardResult } from '@ledgerline/shared';
import { transaction } from './db.ts';
import { permit, type Identity } from './auth.ts';
import { ApiError } from './errors.ts';
const like = (s: string) => '%' + s.replace(/[!%_]/g, (c) => '!' + c) + '%';
type Filters = ReturnType<typeof reportFilterSchema.parse>;
const columns = (pairs: string[][]) => pairs.map(([key, label]) => ({ key, label }));
export const csvCell = (value: unknown) =>
  '"' +
  String(value ?? '')
    .replace(/^[\s]*[=+@-]/, (v) => "'" + v)
    .replaceAll('"', '""') +
  '"';
function report(kind: ReportKind, q: Filters) {
  const dates = [q.date_from, q.date_to],
    search = like(q.search);
  if (kind === 'banking')
    return {
      sql: `SELECT t.transaction_id AS id,t.reference_number,t.transaction_date,a.account_number,b.name AS branch,t.transaction_type,t.amount,t.balance_after,t.description FROM banking_transactions t JOIN accounts a ON a.account_id=t.account_id JOIN branches b ON b.branch_id=t.branch_id WHERE t.transaction_date>=? AND t.transaction_date<DATE_ADD(?,INTERVAL 1 DAY) AND (a.account_number LIKE ? ESCAPE '!' OR t.reference_number LIKE ? ESCAPE '!') AND (?='' OR t.transaction_type=?)`,
      values: [...dates, search, search, q.status, q.status],
      order: 'transaction_date DESC,id DESC',
      columns: columns([
        ['reference_number', 'Reference'],
        ['transaction_date', 'Date (UTC)'],
        ['account_number', 'Account'],
        ['branch', 'Branch'],
        ['transaction_type', 'Type'],
        ['amount', 'Amount · INR'],
        ['balance_after', 'Balance after · INR'],
        ['description', 'Description'],
      ]),
      note: 'Posted ledger entries in this UTC date range. Transfers have two entries; reversals are separate compensating entries. Legacy transaction rows are not replayed.',
      statuses: [
        'deposit',
        'withdrawal',
        'transfer_debit',
        'transfer_credit',
        'reversal_debit',
        'reversal_credit',
      ],
    };
  if (kind === 'payroll')
    return {
      sql: `SELECT p.payroll_id AS id,e.employee_code,e.name AS employee,e.department,p.payroll_period,p.payroll_status,p.gross_salary,p.deductions,p.net_salary,p.processing_reference FROM payroll_records p JOIN employees e ON e.employee_id=p.employee_id WHERE p.payroll_period>=? AND p.payroll_period<=? AND (e.name LIKE ? ESCAPE '!' OR e.employee_code LIKE ? ESCAPE '!') AND (?='' OR p.payroll_status=?)`,
      values: [...dates, search, search, q.status, q.status],
      order: 'payroll_period DESC,id DESC',
      columns: columns([
        ['employee_code', 'Employee code'],
        ['employee', 'Employee'],
        ['department', 'Department'],
        ['payroll_period', 'Payroll month'],
        ['payroll_status', 'Status'],
        ['gross_salary', 'Gross · INR'],
        ['deductions', 'Deductions · INR'],
        ['net_salary', 'Net · INR'],
        ['processing_reference', 'Processing reference'],
      ]),
      note: 'Modern payroll records by payroll period, not payment date. Historical reserved legacy periods are excluded. Processing does not send external payments.',
      statuses: ['draft', 'pending_approval', 'approved', 'processed', 'rejected', 'failed'],
    };
  if (kind === 'accounts')
    return {
      sql: `SELECT a.account_id AS id,a.account_number,c.name AS customer,a.account_status,a.balance,r.opening_balance,r.net_movement,r.discrepancy,r.reconciliation_state FROM accounts a JOIN customers c ON c.customer_id=a.customer_id JOIN v_account_reconciliation r ON r.account_id=a.account_id WHERE (a.account_number LIKE ? ESCAPE '!' OR c.name LIKE ? ESCAPE '!') AND (?='' OR a.account_status=?)`,
      values: [search, search, q.status, q.status],
      order: 'id DESC',
      columns: columns([
        ['account_number', 'Account'],
        ['customer', 'Customer'],
        ['account_status', 'Status'],
        ['balance', 'Current balance · INR'],
        ['opening_balance', 'Opening · INR'],
        ['net_movement', 'Net postings · INR'],
        ['discrepancy', 'Difference · INR'],
        ['reconciliation_state', 'Opening review'],
      ]),
      note: 'Current snapshot of all matching accounts. Date filters do not apply. Opening balances plus all modern signed postings must equal current balances.',
      statuses: ['active', 'frozen', 'closed'],
    };
  return {
    sql: `SELECT b.branch_id AS id,b.branch_code,b.name,b.branch_status,COUNT(t.transaction_id) AS posting_count,COALESCE(SUM(CASE WHEN t.transaction_type IN ('deposit','transfer_credit','reversal_credit') THEN t.amount ELSE 0 END),0.00) credits,COALESCE(SUM(CASE WHEN t.transaction_type IN ('withdrawal','transfer_debit','reversal_debit') THEN t.amount ELSE 0 END),0.00) debits FROM branches b LEFT JOIN banking_transactions t ON t.branch_id=b.branch_id AND t.transaction_date>=? AND t.transaction_date<DATE_ADD(?,INTERVAL 1 DAY) WHERE (b.name LIKE ? ESCAPE '!' OR b.branch_code LIKE ? ESCAPE '!') AND (?='' OR b.branch_status=?) GROUP BY b.branch_id,b.branch_code,b.name,b.branch_status`,
    values: [...dates, search, search, q.status, q.status],
    order: 'name,id',
    columns: columns([
      ['branch_code', 'Branch code'],
      ['name', 'Branch'],
      ['branch_status', 'Status'],
      ['posting_count', 'Postings'],
      ['credits', 'Ledger credits · INR'],
      ['debits', 'Ledger debits · INR'],
    ]),
    note: 'Branches, including those with no postings. Credits/debits include transfer and reversal legs during the selected UTC date range.',
    statuses: ['active', 'inactive'],
  };
}
async function rows(db: PoolConnection, sql: string, args: unknown[] = []) {
  const [r] = await db.query<RowDataPacket[]>(sql, args);
  return r;
}
export function analyticsRouter(pool: Pool) {
  const router = Router();
  router.get('/dashboard', async (req, res) => {
    const q = reportFilterSchema.parse(req.query),
      identity = res.locals.identity as Identity;
    const banking = identity.user.permissions.includes('reports.banking.view'),
      payroll = identity.user.permissions.includes('reports.payroll.view');
    if (!banking && !payroll)
      throw new ApiError(403, 'FORBIDDEN', 'Your role does not allow dashboard reports.');
    const dates = [q.date_from, q.date_to];
    res.json(
      await transaction(pool, async (db) => {
        const result: DashboardResult = { date_from: q.date_from, date_to: q.date_to };
        if (banking) {
          const [current] = await rows(
            db,
            "SELECT (SELECT COUNT(*) FROM accounts) accounts,(SELECT COUNT(*) FROM customers) customers,(SELECT COALESCE(SUM(balance),0.00) FROM accounts) balance,(SELECT COUNT(*) FROM accounts WHERE account_status='frozen') frozen",
          );
          const [totals] = await rows(
            db,
            "SELECT COALESCE(SUM(CASE WHEN transaction_type='deposit' THEN amount ELSE 0 END),0.00) deposits,COALESCE(SUM(CASE WHEN transaction_type='withdrawal' THEN amount ELSE 0 END),0.00) withdrawals FROM banking_transactions WHERE transaction_date>=? AND transaction_date<DATE_ADD(?,INTERVAL 1 DAY)",
            dates,
          );
          const [transfers] = await rows(
            db,
            'SELECT COALESCE(SUM(amount),0.00) volume FROM transfers WHERE created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 DAY)',
            dates,
          );
          const trend = await rows(
            db,
            "SELECT DATE_FORMAT(transaction_date,'%Y-%m-%d') day,COALESCE(SUM(CASE WHEN transaction_type IN ('deposit','transfer_credit','reversal_credit') THEN amount ELSE 0 END),0.00) credits,COALESCE(SUM(CASE WHEN transaction_type IN ('withdrawal','transfer_debit','reversal_debit') THEN amount ELSE 0 END),0.00) debits FROM banking_transactions WHERE transaction_date>=? AND transaction_date<DATE_ADD(?,INTERVAL 1 DAY) GROUP BY DATE(transaction_date),DATE_FORMAT(transaction_date,'%Y-%m-%d') ORDER BY day",
            dates,
          );
          const recent = await rows(
            db,
            'SELECT CAST(t.transaction_id AS CHAR) id,t.reference_number,a.account_number,t.transaction_type,t.amount,t.transaction_date FROM banking_transactions t JOIN accounts a ON a.account_id=t.account_id WHERE t.transaction_date>=? AND t.transaction_date<DATE_ADD(?,INTERVAL 1 DAY) ORDER BY t.transaction_date DESC,t.transaction_id DESC LIMIT 6',
            dates,
          );
          const byDay = new Map(trend.map((t) => [String(t.day), t]));
          const completeTrend: { day: string; credits: string; debits: string }[] = [];
          if (trend.length)
            for (
              let time = Date.parse(q.date_from + 'T00:00:00Z');
              time <= Date.parse(q.date_to + 'T00:00:00Z');
              time += 86400000
            ) {
              const day = new Date(time).toISOString().slice(0, 10),
                row = byDay.get(day);
              completeTrend.push({
                day,
                credits: String(row?.credits ?? '0.00'),
                debits: String(row?.debits ?? '0.00'),
              });
            }
          result.banking = {
            accounts: Number(current.accounts),
            customers: Number(current.customers),
            balance: String(current.balance),
            frozen: Number(current.frozen),
            deposits: String(totals.deposits),
            withdrawals: String(totals.withdrawals),
            transfers: String(transfers.volume),
            trend: completeTrend,
            recent: recent as Record<string, string>[],
          };
        }
        if (payroll) {
          const [current] = await rows(db, 'SELECT COUNT(*) employees FROM employees');
          const [totals] = await rows(
            db,
            "SELECT COALESCE(SUM(CASE WHEN payroll_status='processed' THEN net_salary ELSE 0 END),0.00) processed,COALESCE(SUM(payroll_status='pending_approval'),0) pending FROM payroll_records WHERE payroll_period>=? AND payroll_period<=?",
            dates,
          );
          const trend = await rows(
            db,
            "SELECT DATE_FORMAT(payroll_period,'%Y-%m') month,SUM(net_salary) net,COUNT(*) count FROM payroll_records WHERE payroll_status='processed' AND payroll_period>=? AND payroll_period<=? GROUP BY payroll_period ORDER BY payroll_period",
            dates,
          );
          const recent = await rows(
            db,
            'SELECT CAST(p.payroll_id AS CHAR) id,e.name employee,p.payroll_status,p.payroll_period,p.net_salary FROM payroll_records p JOIN employees e ON e.employee_id=p.employee_id WHERE p.payroll_period>=? AND p.payroll_period<=? ORDER BY p.updated_at DESC,p.payroll_id DESC LIMIT 6',
            dates,
          );
          result.payroll = {
            employees: Number(current.employees),
            processed: String(totals.processed),
            pending: Number(totals.pending),
            trend: trend.map((t) => ({
              month: String(t.month),
              net: String(t.net),
              count: Number(t.count),
            })),
            recent: recent as Record<string, string>[],
          };
        }
        return result;
      }),
    );
  });
  for (const kind of ['banking', 'payroll', 'accounts', 'branches'] as const) {
    const permission = kind === 'payroll' ? 'reports.payroll' : 'reports.banking';
    router.get('/reports/' + kind, permit(permission + '.view'), async (req, res) => {
      const q = reportFilterSchema.parse(req.query),
        s = report(kind, q);
      if (q.status && !s.statuses.includes(q.status))
        throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a valid report status.');
      res.json(
        await transaction(pool, async (db) => {
          const [count] = await rows(
            db,
            `SELECT COUNT(*) total FROM (${s.sql}) report_rows`,
            s.values,
          );
          const items = await rows(db, `${s.sql} ORDER BY ${s.order} LIMIT ? OFFSET ?`, [
            ...s.values,
            q.pageSize,
            (q.page - 1) * q.pageSize,
          ]);
          return {
            columns: s.columns,
            items,
            total: Number(count.total),
            page: q.page,
            pageSize: q.pageSize,
            date_from: q.date_from,
            date_to: q.date_to,
            note: s.note,
          };
        }),
      );
    });
    router.get(
      '/reports/' + kind + '/export',
      permit(permission + '.view'),
      permit(permission + '.export'),
      async (req, res) => {
        const q = reportFilterSchema.parse(req.query),
          s = report(kind, q);
        if (q.status && !s.statuses.includes(q.status))
          throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a valid report status.');
        const csv = await transaction(pool, async (db) => {
          const items = await rows(db, `${s.sql} ORDER BY ${s.order} LIMIT 5001`, s.values);
          if (items.length > 5000)
            throw new ApiError(
              422,
              'EXPORT_TOO_LARGE',
              'Narrow the filters to export at most 5,000 rows. No partial file was exported.',
            );
          await db.execute(
            'INSERT INTO audit_logs(actor_id,action,entity_type,after_values,http_request_id) VALUES (?,?,?,?,?)',
            [
              (res.locals.identity as Identity).user.id,
              'reports.export',
              kind,
              JSON.stringify({ filters: q, rows: items.length }),
              res.locals.requestId,
            ],
          );
          return (
            '\uFEFF' +
            [
              s.columns.map((c) => csvCell(c.label)).join(','),
              ...items.map((r) => s.columns.map((c) => csvCell(r[c.key])).join(',')),
            ].join('\r\n')
          );
        });
        res
          .type('text/csv; charset=utf-8')
          .setHeader('Content-Disposition', `attachment; filename="ledgerline-${kind}.csv"`);
        res.send(csv);
      },
    );
  }
  return router;
}
