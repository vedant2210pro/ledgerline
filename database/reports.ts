import assert from 'node:assert/strict';
import type { Connection, RowDataPacket } from 'mysql2/promise';
export const reportQueries = {
  accountHistory:
    'SELECT transaction_id,transaction_type,amount,balance_after,transaction_date FROM banking_transactions WHERE account_id=? AND transaction_date>=? AND transaction_date<? ORDER BY transaction_date,transaction_id',
  branchesWithActivity:
    'SELECT b.branch_id,b.name,COUNT(t.transaction_id) postings,SUM(t.amount) posted_volume FROM branches b INNER JOIN banking_transactions t ON t.branch_id=b.branch_id GROUP BY b.branch_id,b.name HAVING COUNT(t.transaction_id)>0',
  aboveAverageAccounts:
    'SELECT account_id,account_number,balance FROM accounts WHERE balance>(SELECT AVG(balance) FROM accounts)',
  departmentPayroll:
    "WITH processed AS (SELECT employee_id,net_salary,payroll_period FROM payroll_records WHERE payroll_status='processed') SELECT e.department,p.payroll_period,COUNT(*) employees,SUM(p.net_salary) net_total FROM processed p JOIN employees e ON e.employee_id=p.employee_id GROUP BY e.department,p.payroll_period",
};
export async function verifyFinancial(db: Connection) {
  const routines = [
    'calculate_net_salary',
    'll_authorize',
    'll_lock_account',
    'll_execute',
    'sp_deposit_money',
    'sp_withdraw_money',
    'sp_transfer_money',
    'sp_reverse_transaction',
    'sp_process_payroll',
  ];
  const views = [
    'v_customer_accounts',
    'v_transaction_history',
    'v_account_reconciliation',
    'v_branch_activity',
    'v_employee_payroll',
    'v_monthly_payroll',
  ];
  const [r] = await db.query<RowDataPacket[]>(
    'SELECT ROUTINE_NAME,SECURITY_TYPE FROM information_schema.routines WHERE ROUTINE_SCHEMA=DATABASE()',
  );
  assert(
    routines.every((name) => r.some((row) => row.ROUTINE_NAME === name)),
    'Required financial routine missing',
  );
  const [v] = await db.query<RowDataPacket[]>(
    'SELECT TABLE_NAME,SECURITY_TYPE FROM information_schema.views WHERE TABLE_SCHEMA=DATABASE()',
  );
  assert(
    views.every((name) =>
      v.some((row) => row.TABLE_NAME === name && row.SECURITY_TYPE === 'INVOKER'),
    ),
    'Required invoker view missing',
  );
  for (const name of views) await db.query(`SELECT * FROM ${name} LIMIT 0`);
  const [discrepancies] = await db.query<RowDataPacket[]>(
    'SELECT COUNT(*) n FROM v_account_reconciliation WHERE discrepancy<>0',
  );
  assert.equal(
    Number(discrepancies[0].n),
    0,
    'Account opening plus ledger movements do not reconcile',
  );
  const plans: Record<string, unknown> = {};
  for (const [name, sql] of Object.entries(reportQueries)) {
    const args = name === 'accountHistory' ? ['1', '2000-01-01', '2100-01-01'] : [];
    const [plan] = await db.query<RowDataPacket[]>('EXPLAIN ' + sql, args);
    plans[name] = plan.map((row) => ({
      table: row.table,
      access: row.type,
      possibleKeys: row.possible_keys,
      chosenKey: row.key,
      estimatedRows: row.rows,
    }));
  }
  return { routines: routines.length, views: views.length, reconciled: true, plans };
}
