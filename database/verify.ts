import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { migrationFiles, migrationDirectory, digest } from './migrate.ts';
import { upgradeFiles, directory } from './upgrade/schema.ts';
export const expectedTables = [
  'schema_migrations',
  'roles',
  'permissions',
  'users',
  'user_roles',
  'role_permissions',
  'branches',
  'employees',
  'customers',
  'accounts',
  'payroll_records',
  'operation_requests',
  'transfers',
  'banking_transactions',
  'sessions',
  'login_attempts',
  'login_throttles',
  'audit_logs',
  'seed_runs',
  'legacy_import_batches',
  'legacy_record_links',
  'account_opening_snapshots',
  'legacy_payroll_periods',
];
export async function verify(connection: Connection) {
  const [tables] = await connection.query<RowDataPacket[]>(
    "SELECT TABLE_NAME,ENGINE,TABLE_COLLATION FROM information_schema.tables WHERE table_schema=DATABASE() AND TABLE_TYPE='BASE TABLE'",
  );
  const upgraded = tables.some((r) => r.TABLE_NAME === 'legacy_upgrade_migrations');
  const expected = upgraded
    ? [
        ...expectedTables.filter((t) => t !== 'schema_migrations'),
        'legacy_upgrade_migrations',
        'customer',
        'employee',
        'branch',
        'account',
        'payroll',
        'bank_transaction',
      ]
    : expectedTables;
  assert.deepEqual(
    tables.map((row) => row.TABLE_NAME).sort(),
    [...expected].sort(),
    'Unexpected table inventory',
  );
  assert(
    tables.every((row) => row.ENGINE === 'InnoDB'),
    'Every table must use InnoDB',
  );
  assert(
    tables.every((row) => String(row.TABLE_COLLATION).startsWith('utf8mb4_')),
    'Every table must use utf8mb4',
  );
  const [migrations] = await connection.query<RowDataPacket[]>(
    `SELECT migration_name,status,checksum FROM ${upgraded ? 'legacy_upgrade_migrations' : 'schema_migrations'} ORDER BY migration_name`,
  );
  assert.deepEqual(
    migrations.map((r) => r.migration_name),
    await (upgraded ? upgradeFiles() : migrationFiles()),
  );
  for (const row of migrations) {
    assert.equal(row.status, 'applied', 'All migrations must be applied');
    assert.equal(
      row.checksum,
      digest(
        await readFile(
          new URL(row.migration_name, upgraded ? directory : migrationDirectory),
          'utf8',
        ),
      ),
      'Applied migration checksum mismatch',
    );
  }
  const [constraints] = await connection.query<RowDataPacket[]>(
    'SELECT CONSTRAINT_TYPE,COUNT(*) AS total FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() GROUP BY CONSTRAINT_TYPE',
  );
  const [foreignKeys] = await connection.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND DELETE_RULE <> 'RESTRICT' AND NOT (TABLE_NAME IN ('account','payroll','bank_transaction') AND DELETE_RULE='NO ACTION')",
  );
  assert.equal(Number(foreignKeys[0].total), 0, 'Historical FKs must restrict deletion');
  const [roles] = await connection.query<RowDataPacket[]>(
    'SELECT role_name FROM roles ORDER BY role_name',
  );
  assert.equal(roles.length, 4, 'Four initial roles must exist');
  const [orphan] = await connection.query<RowDataPacket[]>(
    'SELECT COUNT(*) AS total FROM accounts a LEFT JOIN customers c ON c.customer_id=a.customer_id LEFT JOIN employees e ON e.employee_id=a.employee_id WHERE c.customer_id IS NULL OR e.employee_id IS NULL',
  );
  assert.equal(Number(orphan[0].total), 0);
  const [money] = await connection.query<RowDataPacket[]>(
    "SELECT DATA_TYPE,NUMERIC_PRECISION,NUMERIC_SCALE FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='accounts' AND column_name='balance'",
  );
  assert.equal(money[0].DATA_TYPE, 'decimal');
  assert.equal(Number(money[0].NUMERIC_PRECISION), 18);
  assert.equal(Number(money[0].NUMERIC_SCALE), 2);
  const [counts] = await connection.query<RowDataPacket[]>(
    'SELECT (SELECT COUNT(*) FROM customers) AS customers,(SELECT COUNT(*) FROM employees) AS employees,(SELECT COUNT(*) FROM accounts) AS accounts,(SELECT COUNT(*) FROM payroll_records) AS payroll,(SELECT COUNT(*) FROM banking_transactions) AS transactions',
  );
  return {
    tables: tables.length,
    migrations: migrations.length,
    track: upgraded ? 'legacy-upgrade' : 'clean-install',
    constraints,
    counts: counts[0],
    status: 'Schema verification passed',
  };
}
