import { writeFile } from 'node:fs/promises';
import { connect, safeError } from './config.ts';
import type { RowDataPacket } from 'mysql2/promise';

const db = await connect('banking_payroll_db');
try {
  const [rows] = await db.query<RowDataPacket[]>(`SELECT
    (SELECT COUNT(*) FROM customer) AS customers,
    (SELECT COUNT(*) FROM account) AS accounts,
    (SELECT COUNT(*) FROM employee) AS employees,
    (SELECT COUNT(*) FROM payroll) AS payroll,
    (SELECT COUNT(*) FROM branch) AS branches,
    (SELECT COUNT(*) FROM bank_transaction) AS transactions,
    (SELECT COUNT(*) FROM customer WHERE email IS NULL OR TRIM(email)='' OR phone IS NULL OR TRIM(phone)='' OR address IS NULL OR TRIM(address)='') AS customers_missing_required_fields,
    (SELECT COUNT(*) FROM employee WHERE email IS NULL OR TRIM(email)='' OR phone IS NULL OR TRIM(phone)='' OR department IS NULL OR TRIM(department)='' OR CHAR_LENGTH(department)>80) AS employees_needing_review,
    (SELECT COUNT(*) FROM branch WHERE phone IS NULL OR TRIM(phone)='' OR address IS NULL OR TRIM(address)='') AS branches_missing_required_fields,
    (SELECT COUNT(*) FROM account WHERE balance IS NULL OR balance<0) AS invalid_balances,
    (SELECT COUNT(*) FROM account WHERE LOWER(TRIM(account_type)) NOT IN ('savings','current','salary')) AS unmapped_account_types,
    (SELECT COUNT(*) FROM bank_transaction WHERE amount<=0) AS invalid_transaction_amounts,
    (SELECT COUNT(*) FROM bank_transaction WHERE LOWER(TRIM(transaction_type)) NOT IN ('deposit','withdrawal')) AS transaction_types_needing_mapping,
    (SELECT COUNT(*) FROM payroll WHERE bonus IS NULL OR deductions IS NULL OR salary_amount<0 OR bonus<0 OR deductions<0 OR deductions>salary_amount+bonus) AS payroll_values_needing_review,
    (SELECT COUNT(*) FROM (SELECT employee_id,EXTRACT(YEAR_MONTH FROM pay_date) FROM payroll GROUP BY employee_id,EXTRACT(YEAR_MONTH FROM pay_date) HAVING COUNT(*)>1) duplicate_periods) AS duplicate_payroll_period_groups,
    (SELECT COUNT(*) FROM account a LEFT JOIN customer c ON c.customer_id=a.customer_id LEFT JOIN employee e ON e.employee_id=a.employee_id WHERE c.customer_id IS NULL OR e.employee_id IS NULL) AS orphan_accounts,
    (SELECT COUNT(*) FROM bank_transaction t LEFT JOIN account a ON a.account_id=t.account_id LEFT JOIN branch b ON b.branch_id=t.branch_id WHERE a.account_id IS NULL OR b.branch_id IS NULL) AS orphan_transactions,
    (SELECT COUNT(*) FROM payroll p LEFT JOIN employee e ON e.employee_id=p.employee_id WHERE e.employee_id IS NULL) AS orphan_payroll,
    (SELECT COUNT(*) FROM account a LEFT JOIN (SELECT account_id,SUM(CASE LOWER(TRIM(transaction_type)) WHEN 'deposit' THEN amount WHEN 'withdrawal' THEN -amount ELSE 0 END) AS net FROM bank_transaction GROUP BY account_id) t ON t.account_id=a.account_id WHERE a.balance<>COALESCE(t.net,0)) AS accounts_not_reconciled_to_available_history
  `);
  const [accountTypes] = await db.query<RowDataPacket[]>(
    'SELECT account_type AS type,COUNT(*) AS records FROM account GROUP BY account_type',
  );
  const [transactionTypes] = await db.query<RowDataPacket[]>(
    'SELECT transaction_type AS type,COUNT(*) AS records FROM bank_transaction GROUP BY transaction_type',
  );
  const [views] = await db.query<RowDataPacket[]>(
    'SELECT TABLE_NAME,VIEW_DEFINITION FROM information_schema.views WHERE TABLE_SCHEMA=DATABASE()',
  );
  const [triggers] = await db.query<RowDataPacket[]>(
    'SELECT TRIGGER_NAME,EVENT_OBJECT_TABLE,ACTION_TIMING,EVENT_MANIPULATION,ACTION_STATEMENT FROM information_schema.triggers WHERE TRIGGER_SCHEMA=DATABASE()',
  );
  const result = {
    schema: 'banking_payroll_db',
    inspection: 'Read-only inventory; no individual records or credentials exported',
    counts: rows[0],
    accountTypes,
    transactionTypes,
    views,
    triggers,
  };
  await writeFile(
    new URL('../docs/LEGACY_INVENTORY.json', import.meta.url),
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        schema: result.schema,
        counts: rows[0],
        accountTypes,
        transactionTypes,
        viewCount: views.length,
        triggerCount: triggers.length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(safeError(error));
  process.exitCode = 1;
} finally {
  await db.end();
}
