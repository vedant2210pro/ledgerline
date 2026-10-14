import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { connect, safeError } from '../../database/config.ts';
import { migrate } from '../../database/migrate.ts';
import { grantFinance } from '../scripts/grants.ts';
import { createPool } from '../src/db.ts';
import { config } from '../src/config.ts';
import { createApp } from '../src/app.ts';
import { hashPassword } from '../src/crypto.ts';
const c = {
  ...config(),
  database: 'banking_payroll_test',
  secret: randomBytes(48).toString('base64url'),
};
const pool = createPool(c),
  app = createApp(pool, c),
  tag = 'P67-' + randomBytes(5).toString('hex');
let db: Connection;
type Actor = { id: string; cookie: string; csrf: string };
const actors: Record<string, Actor> = {};
let employee: string, branch: string, account: string, other: string;
const send = (role: string, path: string, body: object, method: 'post' | 'patch' = 'post') =>
  request(app)[method]('/api/v1' + path)
    .set('Origin', c.origin)
    .set('Cookie', actors[role].cookie)
    .set('X-CSRF-Token', actors[role].csrf)
    .send(body);
const get = (role: string, path: string) =>
  request(app)
    .get('/api/v1' + path)
    .set('Cookie', actors[role].cookie);
async function insert(sql: string, values: (string | number | null)[]) {
  await db.execute(sql, values);
  const [r] = await db.query<RowDataPacket[]>('SELECT CAST(LAST_INSERT_ID() AS CHAR) id');
  return String(r[0].id);
}
const postBody = (amount = '10.00', id = account) => ({
  account_id: id,
  branch_id: branch,
  amount,
  description: tag + ' posting',
  idempotency_key: randomUUID(),
});
async function balance(id = account) {
  const [r] = await db.execute<RowDataPacket[]>('SELECT balance FROM accounts WHERE account_id=?', [
    id,
  ]);
  return String(r[0].balance);
}
async function reconciled() {
  const [r] = await db.execute<RowDataPacket[]>(
    'SELECT discrepancy FROM v_account_reconciliation WHERE account_id IN (?,?)',
    [account, other],
  );
  assert(r.every((v) => v.discrepancy === '0.00'));
}
async function payrollDraft(period: string) {
  return send('payroll_manager', '/payroll', {
    employee_id: employee,
    payroll_period: period,
    salary_amount: '50000.25',
    bonus: '1000.10',
    deductions: '200.35',
  });
}
before(async () => {
  try {
    db = await connect('banking_payroll_test');
    await migrate(db, 'banking_payroll_test');
    await grantFinance(db, 'banking_payroll_test', process.env.MYSQL_RUNTIME_USER!);
    const password = randomBytes(24).toString('base64url'),
      pw = await hashPassword(password);
    for (const role of ['administrator', 'banking_staff', 'payroll_manager', 'auditor']) {
      const email = tag + '-' + role + '@example.test';
      const id = await insert(
        "INSERT INTO users(name,email,password_hash,account_status) VALUES (?,?,?,'active')",
        [tag + ' ' + role, email, pw],
      );
      await db.execute(
        'INSERT INTO user_roles(user_id,role_id) SELECT ?,role_id FROM roles WHERE role_name=?',
        [id, role],
      );
      const r = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', c.origin)
        .send({ email, password });
      assert.equal(r.status, 200);
      actors[role] = {
        id,
        cookie: String(r.headers['set-cookie'][0]).split(';')[0],
        csrf: r.body.csrfToken,
      };
    }
    const e = await send('payroll_manager', '/employees', {
      employee_code: tag,
      name: 'Finance test officer',
      department: 'Testing',
      phone: '+91 9000000000',
      email: tag + '@example.test',
      designation: 'Officer',
      date_of_joining: '2026-01-01',
      employment_status: 'active',
    });
    assert.equal(e.status, 201);
    employee = e.body.id;
    const customer = await insert(
      "INSERT INTO customers(name,email,phone,address) VALUES ('Finance test customer',?,'TEST','Test address')",
      [tag + '-customer@example.test'],
    );
    branch = await insert(
      "INSERT INTO branches(branch_code,name,address,phone) VALUES (?,'Finance test branch','Test address','TEST')",
      [tag],
    );
    account = await insert(
      "INSERT INTO accounts(account_number,customer_id,employee_id,account_type,open_date) VALUES (?,?,?,'savings','2026-01-01')",
      [tag + '-A', customer, employee],
    );
    other = await insert(
      "INSERT INTO accounts(account_number,customer_id,employee_id,account_type,open_date) VALUES (?,?,?,'savings','2026-01-01')",
      [tag + '-B', customer, employee],
    );
  } catch (e) {
    // eslint-disable-next-line preserve-caught-error -- Avoid logging raw SQL or credentials.
    throw new Error(safeError(e));
  }
});
after(async () => {
  await pool.end();
  if (db) {
    // Committed financial fixtures are retained in the isolated test schema, respecting immutable history.
    for (const actor of Object.values(actors)) {
      await db.execute("UPDATE users SET account_status='disabled' WHERE user_id=?", [actor.id]);
      await db.execute(
        'UPDATE sessions SET revoked_at=UTC_TIMESTAMP(6) WHERE user_id=? AND revoked_at IS NULL',
        [actor.id],
      );
    }
    await db.end();
  }
});
test('money operations enforce role, CSRF and strict decimal inputs', async () => {
  assert.equal((await send('auditor', '/transactions/deposit', postBody())).status, 403);
  assert.equal((await send('payroll_manager', '/transactions/deposit', postBody())).status, 403);
  const r = await request(app)
    .post('/api/v1/transactions/deposit')
    .set('Origin', c.origin)
    .set('Cookie', actors.banking_staff.cookie)
    .send(postBody());
  assert.equal(r.status, 403);
  for (const amount of ['0', '-1', '1.001', '1e3', 'NaN', '10000000000000000'])
    assert.equal(
      (await send('banking_staff', '/transactions/deposit', postBody(amount))).status,
      422,
    );
  assert.equal(
    (
      await send('banking_staff', '/transactions/transfer', {
        ...postBody(),
        destination_account_id: account,
      })
    ).status,
    422,
  );
  assert.equal(await balance(), '0.00');
});
test('concurrent duplicate deposits commit exactly once and reject changed payloads', async () => {
  const body = postBody('100.10');
  const results = await Promise.all([
    send('banking_staff', '/transactions/deposit', body),
    send('banking_staff', '/transactions/deposit', body),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
  assert.equal(results[0].body.reference_number, results[1].body.reference_number);
  assert.equal(await balance(), '100.10');
  assert.equal(
    (await send('banking_staff', '/transactions/deposit', { ...body, amount: '100.11' })).status,
    409,
  );
  await reconciled();
});
test('parallel withdrawals cannot overdraw an account', async () => {
  const results = await Promise.all([
    send('banking_staff', '/transactions/withdrawal', postBody('60.00')),
    send('banking_staff', '/transactions/withdrawal', postBody('60.00')),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await balance(), '40.10');
  await reconciled();
});
test('transfers conserve balances and a reversal compensates both entries only once', async () => {
  const body = { ...postBody('20.05'), destination_account_id: other };
  const r = await send('banking_staff', '/transactions/transfer', body);
  assert.equal(r.status, 201);
  assert.equal(await balance(), '20.05');
  assert.equal(await balance(other), '20.05');
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT transaction_id FROM banking_transactions WHERE reference_number=?',
    [r.body.reference_number + '-1'],
  );
  const rb = {
    branch_id: branch,
    reason: 'Test full transfer reversal',
    idempotency_key: randomUUID(),
  };
  assert.equal(
    (await send('banking_staff', '/transactions/' + rows[0].transaction_id + '/reverse', rb))
      .status,
    403,
  );
  const reversed = await send(
    'administrator',
    '/transactions/' + rows[0].transaction_id + '/reverse',
    rb,
  );
  assert.equal(reversed.status, 201);
  assert.equal(
    (await send('administrator', '/transactions/' + rows[0].transaction_id + '/reverse', rb))
      .status,
    200,
  );
  assert.equal(
    (
      await send('administrator', '/transactions/' + rows[0].transaction_id + '/reverse', {
        ...rb,
        idempotency_key: randomUUID(),
      })
    ).status,
    409,
  );
  assert.equal(await balance(), '40.10');
  assert.equal(await balance(other), '0.00');
  await reconciled();
});
test('opposite-direction concurrent transfers preserve total and reconciliation', async () => {
  assert.equal(
    (await send('banking_staff', '/transactions/deposit', postBody('20.00', other))).status,
    201,
  );
  const results = await Promise.all([
    send('banking_staff', '/transactions/transfer', {
      ...postBody('5.00'),
      destination_account_id: other,
    }),
    send('banking_staff', '/transactions/transfer', {
      ...postBody('5.00', other),
      destination_account_id: account,
    }),
  ]);
  assert(
    results.every((r) => r.status === 201),
    JSON.stringify(results.map((r) => ({ status: r.status, error: r.body.error }))),
  );
  assert.equal(await balance(), '40.10');
  assert.equal(await balance(other), '20.00');
  await reconciled();
});
test('frozen accounts and inactive branches reject without ledger or balance changes', async () => {
  await db.execute("UPDATE accounts SET account_status='frozen' WHERE account_id=?", [other]);
  try {
    assert.equal(
      (
        await send('banking_staff', '/transactions/transfer', {
          ...postBody('5'),
          destination_account_id: other,
        })
      ).status,
      409,
    );
  } finally {
    await db.execute("UPDATE accounts SET account_status='active' WHERE account_id=?", [other]);
  }
  await db.execute("UPDATE branches SET branch_status='inactive' WHERE branch_id=?", [branch]);
  try {
    assert.equal((await send('banking_staff', '/transactions/deposit', postBody('5'))).status, 409);
  } finally {
    await db.execute("UPDATE branches SET branch_status='active' WHERE branch_id=?", [branch]);
  }
  assert.equal(await balance(), '40.10');
  await reconciled();
});
test('failed audit rolls back balance, transfer, history and request so the same key can retry', async () => {
  const trigger = 'test_finance_' + tag.replaceAll('-', '_'),
    body = { ...postBody('1.01'), destination_account_id: other };
  await db.query(
    `CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_logs FOR EACH ROW BEGIN IF NEW.actor_id=${actors.banking_staff.id} AND NEW.action='transactions.transfer' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected finance failure'; END IF; END`,
  );
  try {
    assert.equal((await send('banking_staff', '/transactions/transfer', body)).status, 500);
    assert.equal(await balance(), '40.10');
    const [r] = await db.execute<RowDataPacket[]>(
      'SELECT COUNT(*) n FROM operation_requests WHERE actor_id=? AND idempotency_key=?',
      [actors.banking_staff.id, body.idempotency_key],
    );
    assert.equal(Number(r[0].n), 0);
    await reconciled();
  } finally {
    await db.query(`DROP TRIGGER ${trigger}`);
  }
  assert.equal((await send('banking_staff', '/transactions/transfer', body)).status, 201);
  await reconciled();
});
test('posted history and direct runtime financial writes are prohibited', async () => {
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT transaction_id,request_id FROM banking_transactions WHERE account_id=? LIMIT 1',
    [account],
  );
  await assert.rejects(
    db.execute('UPDATE banking_transactions SET amount=1 WHERE transaction_id=?', [
      rows[0].transaction_id,
    ]),
  );
  await assert.rejects(
    db.execute('DELETE FROM banking_transactions WHERE transaction_id=?', [rows[0].transaction_id]),
  );
  await assert.rejects(
    db.execute('DELETE FROM audit_logs WHERE request_id=?', [rows[0].request_id]),
  );
  for (const sql of [
    'UPDATE accounts SET balance=1 WHERE account_id=0',
    'DELETE FROM banking_transactions WHERE transaction_id=0',
    "CALL ll_authorize(1,'transactions.process')",
  ])
    await assert.rejects(pool.query(sql));
  const r = await get('auditor', '/transactions?account_id=' + account);
  assert.equal(r.status, 200);
  assert(r.body.total > 0);
  assert(r.body.items.every((v: { account_id: string }) => String(v.account_id) === account));
  assert.equal(
    (await get('auditor', '/transactions?date_from=2026-12-01&date_to=2026-01-01')).status,
    422,
  );
});
test('employee permissions, optimistic versions and assigned-account deactivation are enforced', async () => {
  assert.equal((await get('banking_staff', '/employees')).status, 403);
  const e = await get('payroll_manager', '/employees/' + employee);
  assert.equal(e.status, 200);
  const body = Object.fromEntries(
    [
      'employee_code',
      'name',
      'department',
      'phone',
      'email',
      'designation',
      'date_of_joining',
      'employment_status',
      'row_version',
    ].map((k) => [k, e.body[k]]),
  );
  const a = await send(
    'payroll_manager',
    '/employees/' + employee,
    { ...body, department: 'Finance tests' },
    'patch',
  );
  assert.equal(a.status, 200);
  assert.equal(
    (await send('payroll_manager', '/employees/' + employee, body, 'patch')).status,
    409,
  );
  assert.equal(
    (
      await send(
        'payroll_manager',
        '/employees/' + employee,
        { ...body, row_version: a.body.row_version, employment_status: 'inactive' },
        'patch',
      )
    ).status,
    409,
  );
});
test('payroll preview uses exact cents and rejects excessive deductions', async () => {
  const r = await send('payroll_manager', '/payroll/preview', {
    salary_amount: '0.10',
    bonus: '0.20',
    deductions: '0.01',
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.net_salary, '0.29');
  assert.equal(r.body.gross_salary, '0.30');
  assert.equal(
    (
      await send('payroll_manager', '/payroll/preview', {
        salary_amount: '1',
        bonus: '0',
        deductions: '1.01',
      })
    ).status,
    422,
  );
  assert.equal((await get('banking_staff', '/payroll')).status, 403);
});
test('payroll draft, independent approval, idempotent processing, report and audit work end to end', async () => {
  let r = await payrollDraft('2026-01-01');
  assert.equal(r.status, 201);
  const id = r.body.id;
  assert.equal(r.body.net_salary, '50800.00');
  assert.equal((await payrollDraft('2026-01-01')).status, 409);
  assert.equal(
    (
      await send('payroll_manager', '/payroll/' + id + '/process', {
        idempotency_key: randomUUID(),
        description: 'Premature processing',
      })
    ).status,
    409,
  );
  r = await send('payroll_manager', '/payroll/' + id + '/submit', {
    row_version: r.body.row_version,
  });
  assert.equal(r.status, 200);
  assert.equal(
    (
      await send('payroll_manager', '/payroll/' + id + '/approve', {
        row_version: r.body.row_version,
      })
    ).status,
    403,
  );
  r = await send('administrator', '/payroll/' + id + '/approve', {
    row_version: r.body.row_version,
  });
  assert.equal(r.status, 200);
  const body = { idempotency_key: randomUUID(), description: 'Process test payroll' };
  const results = await Promise.all([
    send('payroll_manager', '/payroll/' + id + '/process', body),
    send('payroll_manager', '/payroll/' + id + '/process', body),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
  assert.equal(results[0].body.reference_number, results[1].body.reference_number);
  assert.equal(
    (
      await send('payroll_manager', '/payroll/' + id + '/process', {
        ...body,
        idempotency_key: randomUUID(),
      })
    ).status,
    409,
  );
  const saved = await get('auditor', '/payroll/' + id);
  assert.equal(saved.body.payroll_status, 'processed');
  assert.equal(saved.body.net_salary, '50800.00');
  const audit = await get('auditor', '/payroll/' + id + '/audit');
  assert.equal(audit.status, 200);
  assert.equal(audit.body.total, 4);
  const summary = await get('payroll_manager', '/payroll/summary');
  assert.equal(summary.status, 200);
  assert(
    summary.body.items.some((v: { payroll_status: string }) => v.payroll_status === 'processed'),
  );
  await assert.rejects(db.execute('UPDATE payroll_records SET bonus=0 WHERE payroll_id=?', [id]));
  await assert.rejects(
    pool.execute("UPDATE payroll_records SET processing_reference='forged' WHERE payroll_id=?", [
      id,
    ]),
  );
  await reconciled();
});
test('rejection requires a reason, resubmission clears review and records the current preparer', async () => {
  let r = await payrollDraft('2026-02-01');
  const id = r.body.id;
  assert.equal(r.status, 201);
  r = await send('payroll_manager', '/payroll/' + id + '/submit', {
    row_version: r.body.row_version,
  });
  assert.equal(r.status, 200);
  assert.equal(
    (await send('administrator', '/payroll/' + id + '/reject', { row_version: r.body.row_version }))
      .status,
    422,
  );
  r = await send('administrator', '/payroll/' + id + '/reject', {
    row_version: r.body.row_version,
    reason: 'Incorrect bonus',
  });
  assert.equal(r.status, 200);
  r = await send(
    'administrator',
    '/payroll/' + id,
    {
      employee_id: employee,
      payroll_period: '2026-02-01',
      salary_amount: '10',
      bonus: '2',
      deductions: '1',
      row_version: r.body.row_version,
    },
    'patch',
  );
  assert.equal(r.status, 200);
  assert.equal(String(r.body.created_by), actors.administrator.id);
  assert.equal(r.body.rejection_reason, null);
  r = await send('administrator', '/payroll/' + id + '/submit', {
    row_version: r.body.row_version,
  });
  assert.equal(r.status, 200);
  assert.equal(
    (
      await send('administrator', '/payroll/' + id + '/approve', {
        row_version: r.body.row_version,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await send('payroll_manager', '/payroll/' + id + '/approve', {
        row_version: r.body.row_version,
      })
    ).status,
    200,
  );
});
test('payroll audit failure leaves approval intact and allows a safe retry', async () => {
  let r = await payrollDraft('2026-03-01');
  assert.equal(r.status, 201);
  const id = r.body.id;
  r = await send('payroll_manager', '/payroll/' + id + '/submit', {
    row_version: r.body.row_version,
  });
  assert.equal(r.status, 200);
  r = await send('administrator', '/payroll/' + id + '/approve', {
    row_version: r.body.row_version,
  });
  assert.equal(r.status, 200);
  const trigger = 'test_payroll_' + tag.replaceAll('-', '_'),
    body = { idempotency_key: randomUUID(), description: 'Rollback payroll test' };
  await db.query(
    `CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_logs FOR EACH ROW BEGIN IF NEW.actor_id=${actors.payroll_manager.id} AND NEW.action='payroll.process' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected payroll failure'; END IF; END`,
  );
  try {
    assert.equal((await send('payroll_manager', '/payroll/' + id + '/process', body)).status, 500);
    const saved = await get('payroll_manager', '/payroll/' + id);
    assert.equal(saved.body.payroll_status, 'approved');
    assert.equal(saved.body.processing_reference, null);
  } finally {
    await db.query(`DROP TRIGGER ${trigger}`);
  }
  assert.equal((await send('payroll_manager', '/payroll/' + id + '/process', body)).status, 201);
});
test('revoked reviewer and inactive employee prevent processing', async () => {
  let r = await payrollDraft('2026-04-01');
  assert.equal(r.status, 201);
  const id = r.body.id;
  r = await send('payroll_manager', '/payroll/' + id + '/submit', {
    row_version: r.body.row_version,
  });
  r = await send('administrator', '/payroll/' + id + '/approve', {
    row_version: r.body.row_version,
  });
  assert.equal(r.status, 200);
  const body = { idempotency_key: randomUUID(), description: 'Eligibility test' };
  await db.execute("UPDATE employees SET employment_status='on_leave' WHERE employee_id=?", [
    employee,
  ]);
  try {
    assert.equal((await send('payroll_manager', '/payroll/' + id + '/process', body)).status, 409);
  } finally {
    await db.execute("UPDATE employees SET employment_status='active' WHERE employee_id=?", [
      employee,
    ]);
  }
  await db.execute("UPDATE users SET account_status='disabled' WHERE user_id=?", [
    actors.administrator.id,
  ]);
  try {
    assert.equal((await send('payroll_manager', '/payroll/' + id + '/process', body)).status, 409);
  } finally {
    await db.execute("UPDATE users SET account_status='active' WHERE user_id=?", [
      actors.administrator.id,
    ]);
  }
});
test('database routines reject unauthorized actors and invalid salary components', async () => {
  await assert.rejects(
    pool.query('CALL sp_deposit_money(?,?,?,?,?,?)', [
      actors.auditor.id,
      randomUUID(),
      account,
      branch,
      '1.00',
      'Denied SQL operation',
    ]),
    { code: 'ER_SIGNAL_EXCEPTION' },
  );
  await assert.rejects(pool.query('SELECT calculate_net_salary(10,0,11)'), {
    code: 'ER_SIGNAL_EXCEPTION',
  });
  await assert.rejects(
    pool.query('CALL sp_deposit_money(?,?,?,?,?,?)', [
      actors.banking_staff.id,
      randomUUID(),
      account,
      branch,
      '1.001',
      'Invalid precision',
    ]),
    { code: 'ER_SIGNAL_EXCEPTION' },
  );
  await reconciled();
});
test('legacy payroll periods remain reserved after an employee profile is completed', async () => {
  const batch = await insert(
    "INSERT INTO legacy_import_batches(source_schema,inventory_digest,importer_identity,verification_status,row_counts) VALUES ('test-only',?,'finance test','verified',JSON_OBJECT())",
    [randomBytes(32).toString('hex')],
  );
  await db.execute(
    "INSERT INTO legacy_payroll_periods(employee_id,candidate_period,source_payroll_id,batch_id) VALUES (?,'2025-12-01',?,?)",
    [employee, String(BigInt(employee) + 1000000n), batch],
  );
  assert.equal((await payrollDraft('2025-12-01')).status, 409);
});
