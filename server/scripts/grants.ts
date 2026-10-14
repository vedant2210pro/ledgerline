import type { Connection } from 'mysql2/promise';
export async function grantFinance(db: Connection, schema: string, user: string) {
  if (
    !['banking_payroll_db', 'banking_payroll_test'].includes(schema) ||
    !/^ledgerline_app_[a-f0-9]{8}$/.test(user)
  )
    throw new Error('Unexpected grant target');
  const grants: Record<string, string> = {
    employees:
      'SELECT,INSERT (employee_code,name,department,phone,email,designation,date_of_joining,employment_status),UPDATE (employee_code,name,department,phone,email,designation,date_of_joining,employment_status,row_version)',
    payroll_records:
      'SELECT,INSERT (employee_id,payroll_period,salary_amount,bonus,deductions,gross_salary,net_salary,created_by),UPDATE (employee_id,payroll_period,salary_amount,bonus,deductions,gross_salary,net_salary,created_by,payroll_status,approved_by,approved_at,rejection_reason,row_version)',
    banking_transactions: 'SELECT',
    audit_logs: 'SELECT',
    v_monthly_payroll: 'SELECT',
  };
  for (const [table, grant] of Object.entries(grants))
    await db.query(`GRANT ${grant} ON \`${schema}\`.\`${table}\` TO ?@?`, [user, 'localhost']);
  for (const name of [
    'sp_deposit_money',
    'sp_withdraw_money',
    'sp_transfer_money',
    'sp_reverse_transaction',
    'sp_process_payroll',
  ])
    await db.query(`GRANT EXECUTE ON PROCEDURE \`${schema}\`.\`${name}\` TO ?@?`, [
      user,
      'localhost',
    ]);
  await db.query(`GRANT EXECUTE ON FUNCTION \`${schema}\`.calculate_net_salary TO ?@?`, [
    user,
    'localhost',
  ]);
}
