import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import type { RowDataPacket } from 'mysql2/promise';
import { connect, safeError, rootEnv } from '../../database/config.ts';
import { grantAdmin } from './admin-grants.ts';
import { grantOpeningReview } from './opening-review-grants.ts';
import { grantFinance } from './grants.ts';
import { upgradeFiles, upgradeSchema } from '../../database/upgrade/schema.ts';
import { ensureDatabase, migrate } from '../../database/migrate.ts';
import { snapshot, sameSource } from '../../database/upgrade/inventory.ts';
import { backupLegacy } from '../../database/upgrade/backup.ts';
import { hashPassword } from '../src/crypto.ts';
const grantSpec: Record<string, string[]> = {
  users: ['SELECT'],
  roles: ['SELECT'],
  permissions: ['SELECT'],
  user_roles: ['SELECT'],
  role_permissions: ['SELECT'],
  employees: ['SELECT (employee_id,employee_code,name,employment_status)'],
  customers: [
    'SELECT',
    'INSERT (name,email,phone,address,customer_status)',
    'UPDATE (name,email,phone,address,customer_status,row_version)',
  ],
  branches: [
    'SELECT',
    'INSERT (branch_code,name,address,phone,branch_status)',
    'UPDATE (branch_code,name,address,phone,branch_status,row_version)',
  ],
  accounts: [
    'SELECT',
    'INSERT (account_number,customer_id,employee_id,account_type,open_date)',
    'UPDATE (employee_id,account_status,row_version)',
  ],
  account_opening_snapshots: ['SELECT'],
  sessions: [
    'SELECT',
    'INSERT (user_id,token_hash,csrf_token_hash,expires_at)',
    'UPDATE (revoked_at)',
  ],
  login_throttles: ['SELECT', 'INSERT', 'UPDATE'],
  login_attempts: ['INSERT'],
  audit_logs: [
    'INSERT (actor_id,action,entity_type,entity_id,before_values,after_values,http_request_id)',
  ],
};
let admin: Awaited<ReturnType<typeof connect>> | undefined;
try {
  assert(
    ['127.0.0.1', 'localhost', '::1'].includes(process.env.MYSQL_HOST || '127.0.0.1'),
    'Local setup only; use reviewed provisioning on hosted MySQL.',
  );
  const email = process.env.BOOTSTRAP_EMAIL || '',
    name = process.env.BOOTSTRAP_NAME || '';
  assert(
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && name.trim().length >= 2,
    'Set BOOTSTRAP_EMAIL and BOOTSTRAP_NAME in the ignored root .env.',
  );
  admin = await connect('banking_payroll_db');
  const [tracks] = await admin.query<RowDataPacket[]>(
    "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('legacy_upgrade_migrations','schema_migrations')",
  );
  if (tracks.some((r) => r.TABLE_NAME === 'legacy_upgrade_migrations')) {
    const original = await snapshot(admin);
    const [pending] = await admin.query<RowDataPacket[]>(
      "SELECT COUNT(*) n FROM legacy_upgrade_migrations WHERE migration_name='009_auth_and_records.sql' AND status='applied'",
    );
    const [history] = await admin.query<RowDataPacket[]>(
      "SELECT migration_name FROM legacy_upgrade_migrations WHERE status='applied'",
    );
    if (
      Number(pending[0].n) === 0 ||
      (await upgradeFiles()).some((f) => !history.some((r) => r.migration_name === f))
    ) {
      const b = await backupLegacy('forward-' + new Date().toISOString().replace(/[-:.TZ]/g, ''));
      console.log('Pre-migration backup saved under database/backups (ignored).');
      assert(b.sha256);
    }
    await upgradeSchema(admin);
    sameSource(original, await snapshot(admin));
  } else {
    assert(
      tracks.some((r) => r.TABLE_NAME === 'schema_migrations'),
      'Initialize a fresh schema with db:init, or complete the reviewed legacy upgrade first.',
    );
    await migrate(admin, 'banking_payroll_db');
  }
  const test = await connect();
  try {
    await ensureDatabase(test, 'banking_payroll_test');
    await migrate(test, 'banking_payroll_test');
  } finally {
    await test.end();
  }
  let user = process.env.MYSQL_RUNTIME_USER,
    password = process.env.MYSQL_RUNTIME_PASSWORD;
  if (!user || !password) {
    assert(
      !user && !password,
      'Incomplete runtime configuration: inspect .env before provisioning.',
    );
    user = 'ledgerline_app_' + randomBytes(4).toString('hex');
    password = randomBytes(32).toString('base64url');
    await admin.query('CREATE USER ?@? IDENTIFIED BY ?', [user, 'localhost', password]);
    await appendFile(rootEnv, `\nMYSQL_RUNTIME_USER=${user}\nMYSQL_RUNTIME_PASSWORD=${password}\n`);
  }
  assert(
    /^ledgerline_app_[a-f0-9]{8}$/.test(user),
    'Setup manages only its generated application account.',
  );
  for (const schema of ['banking_payroll_db', 'banking_payroll_test']) {
    await grantFinance(admin, schema, user);
    await grantAdmin(admin, schema, user);
    await grantOpeningReview(admin, schema, user);
    for (const [table, grants] of Object.entries(grantSpec))
      await admin.query(`GRANT ${grants.join(',')} ON \`${schema}\`.\`${table}\` TO ?@?`, [
        user,
        'localhost',
      ]);
  }
  if (!process.env.AUTH_SECRET)
    await appendFile(rootEnv, `AUTH_SECRET=${randomBytes(48).toString('base64url')}\n`);
  if (!process.env.APP_ORIGIN) await appendFile(rootEnv, 'APP_ORIGIN=http://127.0.0.1:5173\n');
  const path = new URL('../../.env.admin.json', import.meta.url);
  const [existing] = await admin.execute<RowDataPacket[]>(
    'SELECT user_id FROM users WHERE email=?',
    [email],
  );
  if (!existing.length) {
    const credentials = existsSync(path)
      ? JSON.parse(await readFile(path, 'utf8'))
      : { email, name, password: randomBytes(24).toString('base64url') };
    assert.equal(
      credentials.email,
      email,
      'Existing bootstrap credentials belong to another identity.',
    );
    await writeFile(path, JSON.stringify(credentials, null, 2) + '\n', { mode: 0o600 });
    await admin.beginTransaction();
    try {
      await admin.execute(
        "INSERT INTO users(name,email,password_hash,account_status) VALUES (?,?,?,'active')",
        [name, email, await hashPassword(credentials.password)],
      );
      await admin.query(
        "INSERT INTO user_roles(user_id,role_id) SELECT LAST_INSERT_ID(),role_id FROM roles WHERE role_name='administrator'",
      );
      await admin.commit();
    } catch (e) {
      await admin.rollback();
      throw e;
    }
  }
  console.log(
    'Schema, restricted runtime account and administrator ready. Read .env.admin.json locally for sign-in; no password was logged.',
  );
} catch (e) {
  console.error(safeError(e));
  process.exitCode = 1;
} finally {
  await admin?.end();
}
