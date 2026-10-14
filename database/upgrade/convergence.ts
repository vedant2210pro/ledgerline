import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { directory, upgradeFiles, upgradeSchema } from './schema.ts';
import { migrationDirectory, digest } from '../migrate.ts';
import { expectedTables, verify } from '../verify.ts';
export async function verifyConvergence(clean: Connection, upgraded: Connection) {
  await verify(clean);
  await verify(upgraded);
  // The baseline remains immutable. Only the payroll table identifier differs in the upgrade track.
  for (const file of await upgradeFiles()) {
    const original = await readFile(new URL(file, migrationDirectory), 'utf8');
    const equivalent = original
      .replace('CREATE TABLE payroll (', 'CREATE TABLE payroll_records (')
      .replaceAll('ON payroll(', 'ON payroll_records(')
      .replaceAll('ALTER TABLE payroll ', 'ALTER TABLE payroll_records ');
    assert.equal(
      digest(await readFile(new URL(file, directory), 'utf8')),
      digest(equivalent),
      'Upgrade source diverges from canonical schema',
    );
  }
  for (const table of expectedTables.filter((t) => t !== 'schema_migrations')) {
    const defs = [];
    for (const db of [clean, upgraded]) {
      const [rows] = await db.query<RowDataPacket[]>(`SHOW CREATE TABLE ${table}`);
      defs.push(String(rows[0]['Create Table']).replace(/AUTO_INCREMENT=\d+ /g, ''));
    }
    assert.equal(
      digest(defs[0]),
      digest(defs[1]),
      `Clean/upgrade table definitions diverge: ${table}`,
    );
  }
  const grants = [];
  for (const db of [clean, upgraded]) {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT r.role_name,p.permission_code FROM role_permissions rp JOIN roles r USING(role_id) JOIN permissions p USING(permission_id) ORDER BY r.role_name,p.permission_code',
    );
    grants.push(digest(JSON.stringify(rows)));
  }
  assert.equal(grants[0], grants[1], 'Role permissions diverge');
  // Metadata tampering tests only touch the isolated restored copy and always restore the original.
  const [records] = await upgraded.query<RowDataPacket[]>(
    'SELECT migration_name,checksum FROM legacy_upgrade_migrations ORDER BY migration_name LIMIT 1',
  );
  const r = records[0];
  try {
    await upgraded.execute(
      'UPDATE legacy_upgrade_migrations SET checksum=? WHERE migration_name=?',
      ['0'.repeat(64), r.migration_name],
    );
    await assert.rejects(upgradeSchema(upgraded), /checksum mismatch/);
    await upgraded.execute(
      "UPDATE legacy_upgrade_migrations SET checksum=?,status='failed' WHERE migration_name=?",
      [r.checksum, r.migration_name],
    );
    await assert.rejects(upgradeSchema(upgraded), /Incomplete DDL/);
  } finally {
    await upgraded.execute(
      "UPDATE legacy_upgrade_migrations SET checksum=?,status='applied' WHERE migration_name=?",
      [r.checksum, r.migration_name],
    );
  }
  return {
    schemaConvergence: true,
    permissionConvergence: true,
    upgradeChecksumGuard: true,
    incompleteUpgradeGuard: true,
  };
}
