import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { digest, splitStatements } from '../migrate.ts';
export const directory = new URL('./migrations/', import.meta.url);
export async function upgradeFiles() {
  return (await readdir(directory)).filter((f) => /^\d{3}_[a-z_]+\.sql$/.test(f)).sort();
}
export async function upgradeSchema(db: Connection) {
  const [locked] = await db.query<RowDataPacket[]>(
    "SELECT GET_LOCK(CONCAT('ledgerline:upgrade:',DATABASE()),10) acquired",
  );
  assert.equal(Number(locked[0].acquired), 1, 'Upgrade lock unavailable');
  try {
    const [tables] = await db.query<RowDataPacket[]>(
      "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'",
    );
    const names = tables.map((r) => String(r.TABLE_NAME));
    assert(
      !names.includes('schema_migrations'),
      'Legacy upgrade cannot adopt a clean-install schema',
    );
    if (!names.includes('legacy_upgrade_migrations'))
      assert.deepEqual(
        names.sort(),
        ['account', 'bank_transaction', 'branch', 'customer', 'employee', 'payroll'],
        'Unexpected source tables',
      );
    await db.query(`CREATE TABLE IF NOT EXISTS legacy_upgrade_migrations (
   migration_name VARCHAR(150) PRIMARY KEY, checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
   status VARCHAR(16) NOT NULL, started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), applied_at DATETIME(6) NULL,
   CONSTRAINT ck_upgrade_status CHECK(status IN ('running','applied','failed'))
  ) ENGINE=InnoDB`);
    const [old] = await db.query<RowDataPacket[]>(
      'SELECT migration_name,checksum,status FROM legacy_upgrade_migrations',
    );
    const files = await upgradeFiles();
    assert(
      old.every((r) => files.includes(r.migration_name)),
      'Unknown upgrade migration',
    );
    for (const file of files) {
      const sql = await readFile(new URL(file, directory), 'utf8');
      const found = old.find((r) => r.migration_name === file);
      if (found) {
        assert.equal(found.checksum, digest(sql), 'Upgrade migration checksum mismatch');
        assert.equal(
          found.status,
          'applied',
          'Incomplete DDL requires manual recovery; source tables remain preserved',
        );
        continue;
      }
      await db.execute(
        "INSERT INTO legacy_upgrade_migrations(migration_name,checksum,status) VALUES (?,?,'running')",
        [file, digest(sql)],
      );
      try {
        for (const stmt of splitStatements(sql)) await db.query(stmt);
        await db.execute(
          "UPDATE legacy_upgrade_migrations SET status='applied',applied_at=CURRENT_TIMESTAMP(6) WHERE migration_name=?",
          [file],
        );
      } catch (error) {
        await db.execute(
          "UPDATE legacy_upgrade_migrations SET status='failed' WHERE migration_name=?",
          [file],
        );
        throw error;
      }
    }
  } finally {
    await db.query("SELECT RELEASE_LOCK(CONCAT('ledgerline:upgrade:',DATABASE()))");
  }
}
