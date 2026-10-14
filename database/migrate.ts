import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { schemaName } from './config.ts';

export const migrationDirectory = new URL('./migrations/', import.meta.url);
export function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
export function splitStatements(sql: string): string[] {
  return sql
    .split(/^-- statement-breakpoint\s*$/m)
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function ensureDatabase(connection: Connection, name: string): Promise<void> {
  if (![schemaName(), 'banking_payroll_test'].includes(name))
    throw new Error('Unexpected schema target.');
  // Identifiers are from the fixed allowlist above, never from an API request.
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
  );
  await connection.changeUser({ database: name });
  await connection.query("SET SESSION time_zone = '+00:00'");
  await connection.query(
    "SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
  );
}

export async function migrationFiles() {
  return (await readdir(migrationDirectory))
    .filter((file) => /^\d{3}_[a-z_]+\.sql$/.test(file))
    .sort();
}

export async function migrate(
  connection: Connection,
  name: string,
): Promise<{ applied: string[]; skipped: number }> {
  const lockName = `ledgerline:migrations:${name}`;
  const [lock] = await connection.execute<RowDataPacket[]>('SELECT GET_LOCK(?, 10) AS acquired', [
    lockName,
  ]);
  if (Number(lock[0].acquired) !== 1)
    throw new Error('Another migration process holds the database lock. Retry later.');
  try {
    const [tables] = await connection.query<RowDataPacket[]>(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    const names = tables.map((row) => String(row.TABLE_NAME ?? row.table_name));
    if (names.length && !names.includes('schema_migrations')) {
      throw new Error(
        'Refusing to adopt a nonempty database without Ledgerline migration metadata. Use a clean named development schema.',
      );
    }
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name VARCHAR(150) PRIMARY KEY,
      checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      status VARCHAR(16) NOT NULL,
      started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      applied_at DATETIME(6) NULL,
      CONSTRAINT ck_migration_status CHECK (status IN ('running','applied','failed'))
    ) ENGINE=InnoDB`);
    const [previous] = await connection.query<RowDataPacket[]>(
      'SELECT migration_name,checksum,status FROM schema_migrations',
    );
    const files = await migrationFiles();
    for (const row of previous) {
      if (!files.includes(String(row.migration_name)))
        throw new Error(
          'Database contains a migration missing from this checkout. Restore the matching source before continuing.',
        );
    }
    const applied: string[] = [];
    let skipped = 0;
    for (const file of files) {
      const sql = await readFile(new URL(file, migrationDirectory), 'utf8');
      const checksum = digest(sql);
      const old = previous.find((row) => row.migration_name === file);
      if (old) {
        if (old.checksum !== checksum)
          throw new Error(
            `Checksum mismatch for ${file}. Do not edit an applied migration; add a new migration.`,
          );
        if (old.status !== 'applied')
          throw new Error(
            `${file} is incomplete. MySQL DDL is not transactional; inspect partial objects and follow the recovery guide.`,
          );
        skipped++;
        continue;
      }
      await connection.execute(
        'INSERT INTO schema_migrations(migration_name,checksum,status) VALUES (?, ?, ?)',
        [file, checksum, 'running'],
      );
      try {
        for (const statement of splitStatements(sql)) await connection.query(statement);
        await connection.execute(
          "UPDATE schema_migrations SET status='applied',applied_at=CURRENT_TIMESTAMP(6) WHERE migration_name=?",
          [file],
        );
        applied.push(file);
      } catch (error) {
        await connection.execute(
          "UPDATE schema_migrations SET status='failed' WHERE migration_name=?",
          [file],
        );
        throw error;
      }
    }
    return { applied, skipped };
  } finally {
    await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]);
  }
}
