import type { Connection } from 'mysql2/promise';
export async function grantAdmin(db: Connection, schema: string, user: string) {
  if (
    !['banking_payroll_db', 'banking_payroll_test'].includes(schema) ||
    !/^ledgerline_app_[a-f0-9]{8}$/.test(user)
  )
    throw new Error('Unexpected grant target');
  const grants: Record<string, string> = {
    users:
      'INSERT (name,email,password_hash,account_status),UPDATE (name,email,password_hash,account_status,row_version)',
    user_roles: 'INSERT,DELETE',
    transfers: 'SELECT',
    v_account_reconciliation: 'SELECT',
    v_customer_accounts: 'SELECT',
    v_branch_activity: 'SELECT',
    v_employee_payroll: 'SELECT',
    v_transaction_history: 'SELECT',
  };
  for (const [table, grant] of Object.entries(grants))
    await db.query(`GRANT ${grant} ON \`${schema}\`.\`${table}\` TO ?@?`, [user, 'localhost']);
}
