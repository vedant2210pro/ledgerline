import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import type { Connection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { connect, safeError } from '../../database/config.ts';
import { ensureDatabase, migrate } from '../../database/migrate.ts';
import { seed } from '../../database/seed.ts';
import { config } from '../src/config.ts';
import { createPool } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import { hashPassword, hash, token, hmac } from '../src/crypto.ts';
const c = {
  ...config(),
  secret: randomBytes(48).toString('base64url'),
  database: 'banking_payroll_test',
};
const throttleEmails = new Set<string>();
const pool = createPool(c),
  app = createApp(pool, c),
  tag = 'P45-' + randomBytes(5).toString('hex'),
  password = token();
let db: Connection;
const users: string[] = [],
  customers: string[] = [],
  accounts: string[] = [],
  branches: string[] = [],
  batches: string[] = [];
let employee: string;
type Auth = { cookie: string; csrf: string; id: string };
const actors: Record<string, Auth> = {};
const customerData = (suffix: string) => ({
  name: tag + ' ' + suffix,
  email: tag.toLowerCase() + '-' + suffix.toLowerCase().replace(/[^a-z0-9]/g, '') + '@example.test',
  phone: '+91 90000 00000',
  address: '123 Test Street, Test City',
  customer_status: 'active',
});
const send = (auth: Auth, method: 'post' | 'patch' | 'delete', path: string, body: object) => {
  const call = request(app)[method]('/api/v1' + path);
  return call
    .set('Origin', c.origin)
    .set('Cookie', auth.cookie)
    .set('X-CSRF-Token', auth.csrf)
    .send(body);
};
const get = (auth: Auth, path: string) =>
  request(app)
    .get('/api/v1' + path)
    .set('Cookie', auth.cookie);
async function login(email: string) {
  throttleEmails.add(email.toLowerCase());
  return request(app).post('/api/v1/auth/login').set('Origin', c.origin).send({ email, password });
}
async function createCustomer(suffix: string) {
  const r = await send(actors.administrator, 'post', '/customers', customerData(suffix));
  assert.equal(r.status, 201);
  customers.push(r.body.id);
  return r.body;
}
async function createAccount(customer: string) {
  const r = await send(actors.administrator, 'post', '/accounts', {
    customer_id: customer,
    employee_id: employee,
    account_type: 'savings',
    open_date: '2026-01-01',
  });
  assert.equal(r.status, 201);
  accounts.push(r.body.id);
  return r.body;
}
before(async () => {
  try {
    db = await connect();
    await ensureDatabase(db, 'banking_payroll_test');
    await migrate(db, 'banking_payroll_test');
    await seed(db, true);
    const pw = await hashPassword(password);
    for (const role of ['administrator', 'banking_staff', 'payroll_manager', 'auditor']) {
      const email = tag + '-' + role + '@example.test';
      const [r] = await db.execute<ResultSetHeader>(
        "INSERT INTO users(name,email,password_hash,account_status) VALUES (?,?,?,'active')",
        [tag + ' ' + role, email, pw],
      );
      const id = String(r.insertId);
      users.push(id);
      await db.execute(
        'INSERT INTO user_roles(user_id,role_id) SELECT ?,role_id FROM roles WHERE role_name=?',
        [id, role],
      );
      const res = await login(email);
      assert.equal(res.status, 200, 'Fixture login failed');
      const cookie = String(res.headers['set-cookie'][0]).split(';')[0];
      actors[role] = { id, cookie, csrf: res.body.csrfToken };
    }
    const [e] = await db.execute<ResultSetHeader>(
      "INSERT INTO employees(employee_code,name,department,phone,email,designation,date_of_joining) VALUES (?,?, 'Testing','TEST',?,'Tester','2026-01-01')",
      [tag, tag + ' Officer', tag + '@example.test'],
    );
    employee = String(e.insertId);
  } catch (e) {
    // eslint-disable-next-line preserve-caught-error -- Raw MySQL causes can reveal private SQL data in test output.
    throw new Error(safeError(e));
  }
});
after(async () => {
  await pool.end();
  if (!db) return;
  // Remove only this run's tagged fixtures, in FK order. Never touch source/application records.
  try {
    for (const id of users) {
      await db.execute('DELETE FROM audit_logs WHERE actor_id=?', [id]);
      await db.execute('DELETE FROM sessions WHERE user_id=?', [id]);
      await db.execute('DELETE FROM user_roles WHERE user_id=?', [id]);
    }
    for (const id of accounts) {
      await db.execute('DELETE FROM account_opening_snapshots WHERE account_id=?', [id]);
      await db.execute('DELETE FROM accounts WHERE account_id=?', [id]);
    }
    for (const id of customers) await db.execute('DELETE FROM customers WHERE customer_id=?', [id]);
    for (const id of branches) await db.execute('DELETE FROM branches WHERE branch_id=?', [id]);
    for (const id of batches)
      await db.execute('DELETE FROM legacy_import_batches WHERE batch_id=?', [id]);
    if (employee) await db.execute('DELETE FROM employees WHERE employee_id=?', [employee]);
    for (const id of users) await db.execute('DELETE FROM users WHERE user_id=?', [id]);
    const subjects = [
      ...Array.from(throttleEmails).map((email) => hmac(c.secret, 'identity:' + email)),
      ...['127.0.0.1', '::ffff:127.0.0.1'].map((ip) => hmac(c.secret, 'address:' + ip)),
    ];
    for (const subject of subjects) {
      await db.execute('DELETE FROM login_attempts WHERE subject_hash=?', [subject]);
      await db.execute('DELETE FROM login_throttles WHERE subject_hash=?', [subject]);
    }
  } finally {
    await db.end();
  }
});
test('liveness, readiness, safe JSON errors and protected endpoints', async () => {
  assert.equal((await request(app).get('/api/v1/health/live')).status, 200);
  assert.equal((await request(app).get('/api/v1/health/ready')).status, 200);
  const denied = await request(app).get('/api/v1/customers');
  assert.equal(denied.status, 401);
  assert(denied.body.error.requestId);
  assert.equal(denied.headers['cache-control'], 'no-store');
  const malformed = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', c.origin)
    .set('Content-Type', 'application/json')
    .send('{');
  assert.equal(malformed.status, 400);
  assert(!JSON.stringify(malformed.body).includes('SyntaxError'));
  const broken = createPool({ ...c, port: 1 });
  try {
    assert.equal((await request(createApp(broken, c)).get('/api/v1/health/ready')).status, 503);
  } finally {
    await broken.end();
  }
});
test('session and CSRF secrets are hashed; cookies use HttpOnly and SameSite', async () => {
  const a = actors.administrator,
    r = await get(a, '/auth/me');
  assert.equal(r.status, 200);
  assert(r.body.user.permissions.includes('customers.create'));
  assert(!JSON.stringify(r.body).includes('password_hash'));
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT token_hash,csrf_token_hash FROM sessions WHERE user_id=?',
    [a.id],
  );
  assert(Buffer.isBuffer(rows[0].token_hash));
  assert.equal(rows[0].token_hash.length, 32);
  assert(!rows[0].csrf_token_hash.equals(Buffer.from(a.csrf)));
  const res = await login(tag + '-auditor@example.test');
  assert.match(res.headers['set-cookie'][0], /HttpOnly/i);
  assert.match(res.headers['set-cookie'][0], /SameSite=Lax/i);
  const prodApp = createApp(pool, { ...c, production: true, origin: 'https://ledgerline.example' });
  const prod = await request(prodApp)
    .post('/api/v1/auth/login')
    .set('Origin', 'https://ledgerline.example')
    .send({ email: tag + '-auditor@example.test', password });
  assert.equal(prod.status, 200);
  assert.match(prod.headers['set-cookie'][0], /^__Host-ledgerline=/);
  assert.match(prod.headers['set-cookie'][0], /; Secure/i);
});
test('unknown users and incorrect passwords return the same safe response', async () => {
  const unknown = await login(tag + '-unknown@example.test');
  const wrong = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', c.origin)
    .send({ email: tag + '-banking_staff@example.test', password: 'not-the-password' });
  assert.equal(unknown.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(unknown.body.error.message, wrong.body.error.message);
});
test('mutation requests require trusted Origin, JSON and the session CSRF token', async () => {
  const a = actors.administrator;
  assert.equal(
    (
      await request(app)
        .post('/api/v1/customers')
        .set('Cookie', a.cookie)
        .send(customerData('noorigin'))
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post('/api/v1/customers')
        .set('Cookie', a.cookie)
        .set('Origin', 'https://evil.example')
        .send(customerData('badorigin'))
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post('/api/v1/customers')
        .set('Cookie', a.cookie)
        .set('Origin', c.origin)
        .send(customerData('nocsrf'))
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post('/api/v1/customers')
        .set('Cookie', a.cookie)
        .set('Origin', c.origin)
        .type('form')
        .send('name=test')
    ).status,
    415,
  );
});
test('roles are enforced server-side, including limited lookup access', async () => {
  assert.equal(
    (await send(actors.auditor, 'post', '/customers', customerData('denied'))).status,
    403,
  );
  assert.equal((await get(actors.auditor, '/customers')).status, 200);
  assert.equal((await get(actors.payroll_manager, '/customers')).status, 403);
  assert.equal((await get(actors.banking_staff, '/lookups/employees')).status, 200);
  assert.equal((await get(actors.auditor, '/lookups/employees')).status, 403);
  assert.equal(
    (
      await send(actors.banking_staff, 'post', '/branches', {
        name: 'No',
        branch_code: 'NO',
        address: 'Test address',
        phone: '+91 90000 00000',
        branch_status: 'active',
      })
    ).status,
    403,
  );
});
test('customer create, validation, literal search, pagination and duplicates', async () => {
  const r = await createCustomer('Alpha');
  assert.equal(typeof r.id, 'string');
  assert.equal(r.row_version, 0);
  const page = await get(
    actors.administrator,
    '/customers?search=' + encodeURIComponent(tag) + '&pageSize=1',
  );
  assert.equal(page.status, 200);
  assert.equal(page.body.items.length, 1);
  assert(page.body.total >= 1);
  assert.equal(
    (await send(actors.administrator, 'post', '/customers', customerData('Alpha'))).status,
    409,
  );
  assert.equal(
    (
      await send(actors.administrator, 'post', '/customers', {
        ...customerData('Bad'),
        actor_id: actors.auditor.id,
      })
    ).status,
    422,
  );
  assert.equal((await get(actors.administrator, '/customers?pageSize=500')).status, 422);
  assert.equal(
    (await get(actors.administrator, '/customers?search=' + encodeURIComponent("%' OR 1=1 --")))
      .body.total,
    0,
  );
  const [logs] = await db.execute<RowDataPacket[]>(
    "SELECT actor_id,http_request_id FROM audit_logs WHERE entity_type='customers' AND entity_id=?",
    [r.id],
  );
  assert.equal(String(logs[0].actor_id), actors.administrator.id);
  assert(logs[0].http_request_id);
});
test('customer update supports deactivation and stale writes fail atomically', async () => {
  const r = await createCustomer('Version');
  const payload = {
    ...customerData('Version'),
    name: tag + ' revised',
    row_version: r.row_version,
  };
  const responses = await Promise.all([
    send(actors.administrator, 'patch', '/customers/' + r.id, payload),
    send(actors.administrator, 'patch', '/customers/' + r.id, payload),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const current = await get(actors.administrator, '/customers/' + r.id);
  assert.equal(current.body.row_version, 1);
  const inactive = await send(actors.administrator, 'patch', '/customers/' + r.id, {
    ...payload,
    customer_status: 'inactive',
    row_version: 1,
  });
  assert.equal(inactive.status, 200);
  assert.equal((await send(actors.administrator, 'delete', '/customers/' + r.id, {})).status, 405);
});
test('accounts start at exact zero; relationship and field spoofing checks hold', async () => {
  const customer = await createCustomer('Owner'),
    account = await createAccount(customer.id);
  assert.equal(account.balance, '0.00');
  assert.equal(account.customer_name, customer.name);
  const base = {
    customer_id: customer.id,
    employee_id: employee,
    account_type: 'savings',
    open_date: '2026-01-01',
  };
  assert.equal(
    (await send(actors.administrator, 'post', '/accounts', { ...base, balance: '999999' })).status,
    422,
  );
  assert.equal(
    (
      await send(actors.administrator, 'post', '/accounts', {
        ...base,
        customer_id: '999999999999',
      })
    ).status,
    409,
  );
  assert.equal(
    (await send(actors.administrator, 'post', '/accounts', { ...base, open_date: '2026-02-31' }))
      .status,
    422,
  );
  assert.equal(
    (await send(actors.administrator, 'post', '/accounts', { ...base, open_date: '2099-01-01' }))
      .status,
    422,
  );
  assert.equal(
    (
      await send(actors.administrator, 'patch', '/customers/' + customer.id, {
        ...customerData('Owner'),
        row_version: 0,
        customer_status: 'inactive',
      })
    ).status,
    409,
  );
  const related = await get(actors.administrator, '/customers/' + customer.id + '/accounts');
  assert.equal(related.body.items[0].id, account.id);
});
test('zero-balance closure retains account, and closed accounts cannot reopen', async () => {
  const customer = await createCustomer('Closure'),
    account = await createAccount(customer.id);
  assert.equal(
    (
      await send(actors.administrator, 'patch', '/accounts/' + account.id, {
        employee_id: employee,
        account_status: 'closed',
        row_version: 0,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await send(actors.administrator, 'patch', '/accounts/' + account.id, {
        employee_id: employee,
        account_status: 'active',
        row_version: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await send(actors.administrator, 'patch', '/customers/' + customer.id, {
        ...customerData('Closure'),
        customer_status: 'inactive',
        row_version: 0,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await send(actors.administrator, 'post', '/accounts', {
        customer_id: customer.id,
        employee_id: employee,
        account_type: 'savings',
        open_date: '2026-01-01',
      })
    ).status,
    409,
  );
});
test('funded closure and activation of unreconciled imported accounts are blocked', async () => {
  const customer = await createCustomer('Frozen'),
    account = await createAccount(customer.id);
  await db.execute(
    "UPDATE accounts SET balance=123.45,account_status='frozen' WHERE account_id=?",
    [account.id],
  );
  const [b] = await db.execute<ResultSetHeader>(
    "INSERT INTO legacy_import_batches(source_schema,inventory_digest,importer_identity,row_counts) VALUES ('banking_payroll_test',?,'test','{}')",
    [hash(tag).toString('hex')],
  );
  batches.push(String(b.insertId));
  await db.execute(
    'INSERT INTO account_opening_snapshots(account_id,batch_id,opening_balance) VALUES (?,?,123.45)',
    [account.id, b.insertId],
  );
  assert.equal(
    (
      await send(actors.administrator, 'patch', '/accounts/' + account.id, {
        employee_id: employee,
        account_status: 'closed',
        row_version: 0,
      })
    ).status,
    409,
  );
  const activate = await send(actors.administrator, 'patch', '/accounts/' + account.id, {
    employee_id: employee,
    account_status: 'active',
    row_version: 0,
  });
  assert.equal(activate.status, 409);
  assert.equal(activate.body.error.code, 'RECONCILIATION_REQUIRED');
  assert.equal((await get(actors.administrator, '/accounts/' + account.id)).body.balance, '123.45');
});
test('branch create/update/status/search workflows preserve history', async () => {
  const payload = {
    name: tag + ' Branch',
    branch_code: tag.toUpperCase(),
    address: '123 Branch Street',
    phone: '+91 90000 00000',
    branch_status: 'active',
  };
  const r = await send(actors.administrator, 'post', '/branches', payload);
  assert.equal(r.status, 201);
  branches.push(r.body.id);
  assert.equal(
    (
      await send(actors.administrator, 'patch', '/branches/' + r.body.id, {
        ...payload,
        branch_status: 'inactive',
        row_version: 0,
      })
    ).status,
    200,
  );
  assert.equal(
    (await get(actors.auditor, '/branches?status=inactive&search=' + tag)).body.items[0].id,
    r.body.id,
  );
  assert.equal(
    (await send(actors.administrator, 'delete', '/branches/' + r.body.id, {})).status,
    405,
  );
});
test('failed audit insert rolls back its entire business mutation', async () => {
  const trigger = 'test_audit_' + tag.replaceAll('-', '_');
  await db.query(
    `CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_logs FOR EACH ROW BEGIN IF NEW.action='customers.create' AND JSON_UNQUOTE(JSON_EXTRACT(NEW.after_values,'$.name'))='${tag} Failure' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected test failure'; END IF; END`,
  );
  try {
    const r = await send(actors.administrator, 'post', '/customers', customerData('Failure'));
    assert.equal(r.status, 500);
    assert(!JSON.stringify(r.body).includes('INSERT'));
    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT COUNT(*) n FROM customers WHERE email=?',
      [customerData('Failure').email],
    );
    assert.equal(Number(rows[0].n), 0);
  } finally {
    await db.query(`DROP TRIGGER ${trigger}`);
  }
});
test('runtime grants prohibit arbitrary balances, historical edits, payroll and deletes', async () => {
  const denied = (sql: string) =>
    assert.rejects(
      pool.query(sql),
      (e: unknown) =>
        !!e &&
        typeof e === 'object' &&
        'code' in e &&
        ['ER_COLUMNACCESS_DENIED_ERROR', 'ER_TABLEACCESS_DENIED_ERROR'].includes(String(e.code)),
    );
  await denied('UPDATE accounts SET balance=100 WHERE account_id=0');
  await denied('DELETE FROM customers WHERE customer_id=0');
  await denied("UPDATE payroll_records SET processing_reference='unauthorized' WHERE payroll_id=0");
  await denied('UPDATE banking_payroll_db.account SET balance=0 WHERE account_id=0');
  await denied('SELECT password_hash FROM banking_payroll_db.employee');
});
test('role removal and disabled users take effect on the next request', async () => {
  const actor = actors.banking_staff;
  await db.execute('DELETE FROM user_roles WHERE user_id=?', [actor.id]);
  assert.equal((await get(actor, '/customers')).status, 403);
  await db.execute("UPDATE users SET account_status='disabled' WHERE user_id=?", [
    actors.payroll_manager.id,
  ]);
  assert.equal((await get(actors.payroll_manager, '/auth/me')).status, 401);
});
test('expiry, logout and session rotation invalidate previous tokens', async () => {
  const actor = actors.administrator;
  const fresh = await login(tag + '-administrator@example.test');
  assert.equal(fresh.status, 200);
  const newAuth = {
    id: actor.id,
    cookie: String(fresh.headers['set-cookie'][0]).split(';')[0],
    csrf: fresh.body.csrfToken,
  };
  const logout = await send(newAuth, 'post', '/auth/logout', {});
  assert.equal(logout.status, 204);
  assert.equal((await get(newAuth, '/auth/me')).status, 401);
  await db.execute(
    'UPDATE sessions SET created_at=UTC_TIMESTAMP(6)-INTERVAL 2 DAY,expires_at=UTC_TIMESTAMP(6)-INTERVAL 1 DAY WHERE token_hash=?',
    [hash(actor.cookie.split('=')[1])],
  );
  assert.equal((await get(actor, '/auth/me')).status, 401);
  const rotate = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', c.origin)
    .set('Cookie', actors.auditor.cookie)
    .send({ email: tag + '-auditor@example.test', password });
  assert.equal(rotate.status, 200);
  assert.equal((await get(actors.auditor, '/auth/me')).status, 401);
});
test('parallel attempts cannot bypass the durable identity throttle', async () => {
  const email = tag + '-ratelimit@example.test';
  const responses = await Promise.all(Array.from({ length: 6 }, () => login(email)));
  assert.deepEqual(responses.map((r) => r.status).sort(), [401, 401, 401, 401, 401, 429]);
});
