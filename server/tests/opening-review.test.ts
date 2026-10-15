import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import request from 'supertest';
import type { Connection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { connect, safeError } from '../../database/config.ts';
import { config } from '../src/config.ts';
import { createPool } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import { hashPassword } from '../src/crypto.ts';
import { grantOpeningReview } from '../scripts/opening-review-grants.ts';
const c = { ...config(), database: 'banking_payroll_test' },
  pool = createPool(c),
  app = createApp(pool, c),
  tag = 'Review-' + randomBytes(4).toString('hex');
let db: Connection,
  createdSource = false,
  employee: string;
const actors: Record<string, { id: string; cookie: string; csrf: string }> = {};
const fixtures: string[] = [];
async function insert(sql: string, values: (string | number | null)[] = []) {
  const [r] = await db.execute<ResultSetHeader>(sql, values);
  return String(r.insertId);
}
const get = (role: string, id: string) =>
  request(app)
    .get('/api/v1/accounts/' + id + '/opening-review')
    .set('Cookie', actors[role].cookie);
const post = (role: string, id: string, body: object) =>
  request(app)
    .post('/api/v1/accounts/' + id + '/opening-review')
    .set('Cookie', actors[role].cookie)
    .set('Origin', c.origin)
    .set('X-CSRF-Token', actors[role].csrf)
    .send(body);
const body = {
  row_version: 0,
  opening_balance: '100.00',
  review_note: 'Compared the original source and opening snapshot.',
  confirmed: true,
};
before(async () => {
  try {
    db = await connect('banking_payroll_test');
    const [exists] = await db.query<RowDataPacket[]>(
      "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='account'",
    );
    assert.equal(exists.length, 0, 'Test-only source table must not pre-exist');
    await db.query(
      'CREATE TABLE account (account_id BIGINT UNSIGNED PRIMARY KEY,customer_id BIGINT UNSIGNED NOT NULL,employee_id BIGINT UNSIGNED NOT NULL,account_type VARCHAR(20),balance DECIMAL(18,2),open_date DATE) ENGINE=InnoDB',
    );
    createdSource = true;
    await grantOpeningReview(db, 'banking_payroll_test', process.env.MYSQL_RUNTIME_USER!);
    const password = randomBytes(24).toString('base64url'),
      hash = await hashPassword(password);
    for (const role of ['administrator', 'banking_staff', 'auditor', 'payroll_manager']) {
      const email = tag + '-' + role + '@example.test',
        id = await insert(
          "INSERT INTO users(name,email,password_hash,account_status) VALUES (?,?,?,'active')",
          [tag, email, hash],
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
    const customer = await insert(
      "INSERT INTO customers(name,email,phone,address) VALUES (?,?,'TEST','Test address')",
      [tag, tag + '@example.test'],
    );
    employee = await insert(
      "INSERT INTO employees(employee_code,name,department,phone,email,designation,date_of_joining) VALUES (?,?,'Test','TEST',?,'Officer','2026-01-01')",
      [tag, tag, tag + '-e@example.test'],
    );
    const batch = await insert(
      "INSERT INTO legacy_import_batches(source_schema,inventory_digest,importer_identity,verification_status,row_counts) VALUES ('test',?,?,'verified','{}')",
      [createHash('sha256').update(tag).digest('hex'), tag],
    );
    for (let n = 0; n < 4; n++) {
      const id = await insert(
        "INSERT INTO accounts(account_number,customer_id,employee_id,account_type,balance,open_date,account_status) VALUES (?,?,?,'savings',100,'2026-01-01','frozen')",
        [tag + '-' + n, customer, employee],
      );
      fixtures.push(id);
      await db.execute("INSERT INTO account VALUES (?,?,?,'Savings',100,'2026-01-01')", [
        id,
        customer,
        employee,
      ]);
      const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM account WHERE account_id=?', [
        id,
      ]);
      await db.execute(
        "INSERT INTO legacy_record_links VALUES ('account',?,'accounts',?,?,?,'mapped')",
        [id, id, batch, createHash('sha256').update(JSON.stringify(rows[0])).digest('hex')],
      );
      await db.execute(
        'INSERT INTO account_opening_snapshots(account_id,batch_id,opening_balance) VALUES (?,?,100)',
        [id, batch],
      );
    }
  } catch (e) {
    // eslint-disable-next-line preserve-caught-error -- No SQL or credentials in test errors.
    throw new Error(safeError(e));
  }
});
after(async () => {
  await pool.end();
  if (db) {
    await db.query('DROP TRIGGER IF EXISTS fail_opening_review_audit');
    if (createdSource) await db.query('DROP TABLE account');
    for (const a of Object.values(actors)) {
      await db.execute("UPDATE users SET account_status='disabled' WHERE user_id=?", [a.id]);
      await db.execute(
        'UPDATE sessions SET revoked_at=UTC_TIMESTAMP(6) WHERE user_id=? AND revoked_at IS NULL',
        [a.id],
      );
    }
    await db.end();
  }
});
test('opening review displays verified source and enforces read/write role and CSRF boundaries', async () => {
  const id = fixtures[0],
    r = await get('administrator', id);
  assert.equal(r.status, 200);
  assert.equal(r.body.source_matches, true);
  assert.equal(r.body.source_balance, '100.00');
  assert.equal(r.body.discrepancy, '0.00');
  assert.equal((await get('auditor', id)).status, 200);
  assert.equal((await get('payroll_manager', id)).status, 403);
  assert.equal((await post('banking_staff', id, body)).status, 403);
  assert.equal(
    (
      await request(app)
        .post('/api/v1/accounts/' + id + '/opening-review')
        .set('Cookie', actors.administrator.cookie)
        .set('Origin', c.origin)
        .send(body)
    ).status,
    403,
  );
  assert.equal((await post('administrator', id, { ...body, confirmed: false })).status, 422);
  assert.equal((await post('administrator', id, { ...body, review_note: 'short' })).status, 422);
});
test('review refuses wrong amounts, ledger discrepancies and changed legacy source', async () => {
  const id = fixtures[0];
  assert.equal(
    (await post('administrator', id, { ...body, opening_balance: '99.00' })).status,
    409,
  );
  await db.execute('UPDATE accounts SET balance=101 WHERE account_id=?', [id]);
  assert.equal((await post('administrator', id, body)).status, 409);
  await db.execute('UPDATE accounts SET balance=100 WHERE account_id=?', [id]);
  await db.execute('UPDATE account SET balance=101 WHERE account_id=?', [id]);
  assert.equal((await get('administrator', id)).body.source_matches, false);
  assert.equal((await post('administrator', id, body)).status, 409);
  await db.execute('UPDATE account SET balance=100 WHERE account_id=?', [id]);
});
test('concurrent reviews commit one audited decision without activating or changing the balance', async () => {
  const id = fixtures[0],
    r = await Promise.all([post('administrator', id, body), post('administrator', id, body)]);
  assert.deepEqual(r.map((v) => v.status).sort(), [200, 409]);
  const current = await get('administrator', id);
  assert.equal(current.body.reconciliation_state, 'reviewed');
  assert.equal(current.body.account_status, 'frozen');
  assert.equal(current.body.balance, '100.00');
  assert.equal(current.body.row_version, 1);
  assert.equal(current.body.reviewed_by, actors.administrator.id);
  const [logs] = await db.execute<RowDataPacket[]>(
    "SELECT COUNT(*) n FROM audit_logs WHERE action='accounts.opening_review' AND entity_id=?",
    [id],
  );
  assert.equal(Number(logs[0].n), 1);
  assert.equal((await post('administrator', id, { ...body, row_version: 1 })).status, 409);
  const active = await request(app)
    .patch('/api/v1/accounts/' + id)
    .set('Cookie', actors.administrator.cookie)
    .set('Origin', c.origin)
    .set('X-CSRF-Token', actors.administrator.csrf)
    .send({ employee_id: employee, account_status: 'active', row_version: 1 });
  assert.equal(active.status, 200);
  assert.equal(active.body.balance, '100.00');
});
test('audit failure rolls back review metadata and account version', async () => {
  const id = fixtures[1];
  await db.query(
    "CREATE TRIGGER fail_opening_review_audit BEFORE INSERT ON audit_logs FOR EACH ROW BEGIN IF NEW.action='accounts.opening_review' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected test failure'; END IF; END",
  );
  try {
    assert.equal((await post('administrator', id, body)).status, 500);
  } finally {
    await db.query('DROP TRIGGER fail_opening_review_audit');
  }
  const r = await get('administrator', id);
  assert.equal(r.body.reconciliation_state, 'pending');
  assert.equal(r.body.reviewed_by, null);
  assert.equal(r.body.row_version, 0);
});
test('runtime cannot edit snapshot amount and pending review still blocks activation', async () => {
  await assert.rejects(
    pool.execute('UPDATE account_opening_snapshots SET opening_balance=0 WHERE account_id=?', [
      fixtures[2],
    ]),
  );
  const r = await request(app)
    .patch('/api/v1/accounts/' + fixtures[2])
    .set('Cookie', actors.administrator.cookie)
    .set('Origin', c.origin)
    .set('X-CSRF-Token', actors.administrator.csrf)
    .send({ employee_id: employee, account_status: 'active', row_version: 0 });
  assert.equal(r.status, 409);
});
test('existing officer on leave does not block freezing an active account', async () => {
  const id = fixtures[0];
  await db.execute("UPDATE employees SET employment_status='on_leave' WHERE employee_id=?", [
    employee,
  ]);
  const r = await request(app)
    .patch('/api/v1/accounts/' + id)
    .set('Cookie', actors.administrator.cookie)
    .set('Origin', c.origin)
    .set('X-CSRF-Token', actors.administrator.csrf)
    .send({ employee_id: employee, account_status: 'frozen', row_version: 2 });
  assert.equal(r.status, 200);
  assert.equal(r.body.account_status, 'frozen');
  await db.execute("UPDATE employees SET employment_status='active' WHERE employee_id=?", [
    employee,
  ]);
});
