import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { connect, safeError, schemaName } from '../config.ts';
import { ensureDatabase, migrate } from '../migrate.ts';
import { seed } from '../seed.ts';
import { verify } from '../verify.ts';

let db: Connection;
const schema = schemaName(true);
const tag = randomUUID().slice(0, 8);
const ids: Record<string, number> = {};
async function insert(sql: string, values: (string | number | null)[] = []) {
  const [result] = await db.execute<ResultSetHeader>(sql, values);
  return result.insertId;
}
async function rejectSql(sql: string, values: (string | number | null)[], expected: string) {
  await assert.rejects(db.execute(sql, values), (error: unknown) => {
    return !!error && typeof error === 'object' && 'code' in error && error.code === expected;
  });
}
async function rollbackCase(work: () => Promise<void>) {
  await db.query('SAVEPOINT test_case');
  try {
    await work();
  } finally {
    await db.query('ROLLBACK TO SAVEPOINT test_case');
  }
}

before(async () => {
  try {
    db = await connect();
    await ensureDatabase(db, schema);
    await migrate(db, schema);
    await verify(db);
    await seed(db, true); // Explicit test-only seed; fixed isolated test schema.
    await db.beginTransaction();
    ids.user = await insert(
      "INSERT INTO users(name,email,account_status) VALUES ('Test preparer',?,'disabled')",
      [`preparer-${tag}@example.test`],
    );
    ids.reviewer = await insert(
      "INSERT INTO users(name,email,account_status) VALUES ('Test reviewer',?,'disabled')",
      [`reviewer-${tag}@example.test`],
    );
    ids.customer = await insert(
      "INSERT INTO customers(name,email,phone,address) VALUES ('Test customer',?,'TEST','Test address')",
      [`customer-${tag}@example.test`],
    );
    ids.customer2 = await insert(
      "INSERT INTO customers(name,email,phone,address) VALUES ('Test second customer',?,'TEST','Test address')",
      [`customer2-${tag}@example.test`],
    );
    ids.employee = await insert(
      "INSERT INTO employees(employee_code,name,department,phone,email,designation,date_of_joining) VALUES (?,'Test employee','Testing','TEST',?,'Tester','2026-01-01')",
      [`T-${tag}`, `employee-${tag}@example.test`],
    );
    ids.branch = await insert(
      "INSERT INTO branches(branch_code,name,address,phone) VALUES (?,'Test branch','Test address','TEST')",
      [`T-${tag}`],
    );
    ids.account = await insert(
      "INSERT INTO accounts(account_number,customer_id,employee_id,account_type,open_date) VALUES (?, ?, ?, 'savings','2026-10-01')",
      [`T-${tag}-A`, ids.customer, ids.employee],
    );
    ids.account2 = await insert(
      "INSERT INTO accounts(account_number,customer_id,employee_id,account_type,open_date) VALUES (?, ?, ?, 'savings','2026-10-01')",
      [`T-${tag}-B`, ids.customer, ids.employee],
    );
    ids.request = await insert(
      "INSERT INTO operation_requests(actor_id,operation,idempotency_key,payload_hash) VALUES (?,'deposit',?,UNHEX(SHA2('test',256)))",
      [ids.user, `T-${tag}`],
    );
    ids.payroll_records = await insert(
      "INSERT INTO payroll_records(employee_id,salary_amount,bonus,deductions,gross_salary,net_salary,payroll_period,created_by) VALUES (?,50000,2000,3000,52000,49000,'2026-10-01',?)",
      [ids.employee, ids.user],
    );
  } catch (error) {
    // Do not attach raw driver errors: the test runner prints their SQL and connection details.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(safeError(error));
  }
});

after(async () => {
  if (db) {
    await db.rollback();
    await db.end();
  }
});

test('all expected InnoDB tables, roles, constraints and DECIMAL columns exist', async () => {
  const result = await verify(db);
  assert.equal(result.tables, 23);
  assert.equal(result.migrations, 13);
  assert(Number(result.constraints.find((row) => row.CONSTRAINT_TYPE === 'CHECK')?.total) >= 30);
});

test('account opening balance is an exact decimal zero string', async () => {
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT balance FROM accounts WHERE account_id=?',
    [ids.account],
  );
  assert.equal(rows[0].balance, '0.00');
});

test('customer-account-employee joins preserve required relationships', async () => {
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT a.account_id,c.customer_id,e.employee_id FROM accounts a INNER JOIN customers c ON c.customer_id=a.customer_id INNER JOIN employees e ON e.employee_id=a.employee_id WHERE a.account_id=?',
    [ids.account],
  );
  assert.equal(Number(rows[0].customer_id), ids.customer);
  assert.equal(Number(rows[0].employee_id), ids.employee);
});

test('LEFT JOIN retains a customer without accounts', async () => {
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT c.customer_id,COUNT(a.account_id) AS total FROM customers c LEFT JOIN accounts a ON a.customer_id=c.customer_id WHERE c.customer_id=? GROUP BY c.customer_id',
    [ids.customer2],
  );
  assert.equal(Number(rows[0].total), 0);
});

test('foreign keys reject an account with missing customer', async () => {
  await rejectSql(
    "INSERT INTO accounts(account_number,customer_id,employee_id,account_type,open_date) VALUES (?,18446744073709551614,?,'savings','2026-10-01')",
    [`BAD-${tag}`, ids.employee],
    'ER_NO_REFERENCED_ROW_2',
  );
});

test('unique customer emails and account numbers are enforced', async () => {
  await rejectSql(
    "INSERT INTO customers(name,email,phone,address) VALUES ('Duplicate',?,'TEST','Test')",
    [`customer-${tag}@example.test`],
    'ER_DUP_ENTRY',
  );
  await rejectSql(
    "INSERT INTO accounts(account_number,customer_id,employee_id,account_type,open_date) VALUES (?, ?, ?, 'savings','2026-10-01')",
    [`T-${tag}-A`, ids.customer, ids.employee],
    'ER_DUP_ENTRY',
  );
});

test('negative balances, unknown statuses and non-INR accounts are rejected', async () => {
  for (const sql of [
    'UPDATE accounts SET balance=-1 WHERE account_id=?',
    "UPDATE accounts SET account_status='invalid' WHERE account_id=?",
    "UPDATE accounts SET currency='USD' WHERE account_id=?",
  ])
    await rejectSql(sql, [ids.account], 'ER_CHECK_CONSTRAINT_VIOLATED');
});

test('closing a funded account is rejected', async () =>
  rollbackCase(async () => {
    await db.execute('UPDATE accounts SET balance=10 WHERE account_id=?', [ids.account]);
    await rejectSql(
      "UPDATE accounts SET account_status='closed' WHERE account_id=?",
      [ids.account],
      'ER_CHECK_CONSTRAINT_VIOLATED',
    );
  }));

test('deleting linked customers and employees preserves account history', async () => {
  await rejectSql(
    'DELETE FROM customers WHERE customer_id=?',
    [ids.customer],
    'ER_ROW_IS_REFERENCED_2',
  );
  await rejectSql(
    'DELETE FROM employees WHERE employee_id=?',
    [ids.employee],
    'ER_ROW_IS_REFERENCED_2',
  );
});

test('payroll_records period uniqueness and first-of-month rule are enforced', async () => {
  await rejectSql(
    "INSERT INTO payroll_records(employee_id,salary_amount,gross_salary,net_salary,payroll_period,created_by) VALUES (?,1,1,1,'2026-10-01',?)",
    [ids.employee, ids.user],
    'ER_DUP_ENTRY',
  );
  await rejectSql(
    "UPDATE payroll_records SET payroll_period='2026-11-02' WHERE payroll_id=?",
    [ids.payroll_records],
    'ER_CHECK_CONSTRAINT_VIOLATED',
  );
});

test('payroll_records amounts must reconcile with base plus bonus minus deductions', async () => {
  for (const sql of [
    'UPDATE payroll_records SET net_salary=49000.01 WHERE payroll_id=?',
    'UPDATE payroll_records SET gross_salary=1 WHERE payroll_id=?',
    'UPDATE payroll_records SET deductions=999999 WHERE payroll_id=?',
    'UPDATE payroll_records SET bonus=-1 WHERE payroll_id=?',
  ])
    await rejectSql(sql, [ids.payroll_records], 'ER_CHECK_CONSTRAINT_VIOLATED');
});

test('approval requires a distinct preparer and reviewer', async () =>
  rollbackCase(async () => {
    await rejectSql(
      "UPDATE payroll_records SET payroll_status='approved' WHERE payroll_id=?",
      [ids.payroll_records],
      'ER_CHECK_CONSTRAINT_VIOLATED',
    );
    await rejectSql(
      "UPDATE payroll_records SET payroll_status='approved',approved_by=?,approved_at=NOW(6) WHERE payroll_id=?",
      [ids.user, ids.payroll_records],
      'ER_CHECK_CONSTRAINT_VIOLATED',
    );
    await db.execute(
      "UPDATE payroll_records SET payroll_status='approved',approved_by=?,approved_at=NOW(6) WHERE payroll_id=?",
      [ids.reviewer, ids.payroll_records],
    );
    await rejectSql(
      "UPDATE payroll_records SET payroll_status='processed' WHERE payroll_id=?",
      [ids.payroll_records],
      'ER_CHECK_CONSTRAINT_VIOLATED',
    );
  }));

test('payroll_records rejects rejection without explanation', async () => {
  await rejectSql(
    "UPDATE payroll_records SET payroll_status='rejected' WHERE payroll_id=?",
    [ids.payroll_records],
    'ER_CHECK_CONSTRAINT_VIOLATED',
  );
});

test('idempotency uniqueness is scoped by actor and operation', async () =>
  rollbackCase(async () => {
    await rejectSql(
      "INSERT INTO operation_requests(actor_id,operation,idempotency_key,payload_hash) VALUES (?,'deposit',?,UNHEX(SHA2('changed',256)))",
      [ids.user, `T-${tag}`],
      'ER_DUP_ENTRY',
    );
    await insert(
      "INSERT INTO operation_requests(actor_id,operation,idempotency_key,payload_hash) VALUES (?,'withdrawal',?,UNHEX(SHA2('test',256)))",
      [ids.user, `T-${tag}`],
    );
  }));

test('same-account and nonpositive transfers are rejected', async () => {
  const sql =
    'INSERT INTO transfers(reference_number,request_id,source_account_id,destination_account_id,amount,created_by) VALUES (?,?,?,?,?,?)';
  await rejectSql(
    sql,
    [`X-${tag}`, ids.request, ids.account, ids.account, 10, ids.user],
    'ER_CHECK_CONSTRAINT_VIOLATED',
  );
  await rejectSql(
    sql,
    [`X-${tag}`, ids.request, ids.account, ids.account2, 0, ids.user],
    'ER_CHECK_CONSTRAINT_VIOLATED',
  );
});

test('transaction amount, transfer grouping and reversal linkage constraints hold', async () => {
  const sql =
    "INSERT INTO banking_transactions(account_id,branch_id,request_id,transaction_type,amount,balance_after,description,reference_number,created_by) VALUES (?,?,?,?,?,0,'Test only',?,?)";
  await rejectSql(
    sql,
    [ids.account, ids.branch, ids.request, 'deposit', 0, `TX-${tag}`, ids.user],
    'ER_CHECK_CONSTRAINT_VIOLATED',
  );
  await rejectSql(
    sql,
    [ids.account, ids.branch, ids.request, 'transfer_debit', 1, `TX-${tag}`, ids.user],
    'ER_CHECK_CONSTRAINT_VIOLATED',
  );
  await rejectSql(
    sql,
    [ids.account, ids.branch, ids.request, 'reversal_credit', 1, `TX-${tag}`, ids.user],
    'ER_CHECK_CONSTRAINT_VIOLATED',
  );
});

test('transaction foreign keys protect branch and account history', async () =>
  rollbackCase(async () => {
    await insert(
      "INSERT INTO banking_transactions(account_id,branch_id,request_id,transaction_type,amount,balance_after,description,reference_number,created_by) VALUES (?,?,?,'deposit',1,1,'Rolled-back schema fixture',?,?)",
      [ids.account, ids.branch, ids.request, `TX-${tag}`, ids.user],
    );
    await rejectSql(
      'DELETE FROM branches WHERE branch_id=?',
      [ids.branch],
      'ER_ROW_IS_REFERENCED_2',
    );
    await rejectSql(
      'DELETE FROM accounts WHERE account_id=?',
      [ids.account],
      'ER_ROW_IS_REFERENCED_2',
    );
  }));

test('session expiration must follow creation', async () => {
  await rejectSql(
    "INSERT INTO sessions(user_id,token_hash,csrf_token_hash,created_at,expires_at) VALUES (?,UNHEX(SHA2('token',256)),UNHEX(SHA2('csrf',256)),'2026-10-01','2026-09-01')",
    [ids.user],
    'ER_CHECK_CONSTRAINT_VIOLATED',
  );
});

test('role grants do not allow an auditor to mutate records', async () => {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT p.permission_code FROM role_permissions rp JOIN roles r ON r.role_id=rp.role_id JOIN permissions p ON p.permission_id=rp.permission_id WHERE r.role_name='auditor'",
  );
  assert(rows.length > 0);
  assert(rows.every((row) => /\.(view|export)$/.test(row.permission_code)));
});

test('rollback removes all test-case changes', async () => {
  await rollbackCase(async () => {
    await db.execute('UPDATE accounts SET balance=100.25 WHERE account_id=?', [ids.account]);
  });
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT balance FROM accounts WHERE account_id=?',
    [ids.account],
  );
  assert.equal(rows[0].balance, '0.00');
});

test('seeding requires explicit opt-in', async () => {
  await assert.rejects(seed(db, false), /opt-in/);
});

// These operations may commit: roll back disposable fixtures first.
test('migrations and seeds safely rerun without overwriting records', async () => {
  await db.rollback();
  const result = await migrate(db, schema);
  assert.equal(result.applied.length, 0);
  assert.equal(result.skipped, 13);
  assert.match(await seed(db, true), /already applied/);
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS total,COALESCE(SUM(balance),0) AS balance FROM accounts WHERE account_number LIKE 'DEMO-%'",
  );
  assert.equal(Number(rows[0].total), 3);
  assert.equal(rows[0].balance, '0.00');
});

test('migration checksum mismatch is rejected', async () => {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT migration_name,checksum FROM schema_migrations ORDER BY migration_name LIMIT 1',
  );
  const row = rows[0];
  try {
    await db.execute('UPDATE schema_migrations SET checksum=? WHERE migration_name=?', [
      '0'.repeat(64),
      row.migration_name,
    ]);
    await assert.rejects(migrate(db, schema), /Checksum mismatch/);
  } finally {
    await db.execute('UPDATE schema_migrations SET checksum=? WHERE migration_name=?', [
      row.checksum,
      row.migration_name,
    ]);
  }
});

test('incomplete DDL migration cannot silently resume', async () => {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT migration_name FROM schema_migrations ORDER BY migration_name LIMIT 1',
  );
  const name = rows[0].migration_name;
  try {
    await db.execute("UPDATE schema_migrations SET status='failed' WHERE migration_name=?", [name]);
    await assert.rejects(migrate(db, schema), /incomplete/);
  } finally {
    await db.execute("UPDATE schema_migrations SET status='applied' WHERE migration_name=?", [
      name,
    ]);
  }
});
