import { readFile } from 'node:fs/promises';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { digest, splitStatements } from './migrate.ts';
export const seedName = 'phase2_fictional_v1';
export async function seed(connection: Connection, allowDemo: boolean): Promise<string> {
  if (!allowDemo)
    throw new Error(
      'Fictional seeding is opt-in. Set ALLOW_DEMO_SEED=true only in your local development .env.',
    );
  const [legacy] = await connection.query<RowDataPacket[]>(
    "SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='legacy_upgrade_migrations'",
  );
  if (Number(legacy[0].n))
    throw new Error(
      'Fictional seed is disabled on the preserved legacy database. Use banking_payroll_test.',
    );
  const sql = await readFile(new URL('./seeds/phase2_fictional.sql', import.meta.url), 'utf8');
  const checksum = digest(sql);
  const [lock] = await connection.query<RowDataPacket[]>(
    "SELECT GET_LOCK(CONCAT('ledgerline:seed:',DATABASE()),10) AS acquired",
  );
  if (Number(lock[0].acquired) !== 1) throw new Error('Another seed operation is running.');
  try {
    await connection.beginTransaction();
    const [previous] = await connection.execute<RowDataPacket[]>(
      'SELECT checksum FROM seed_runs WHERE seed_name=? FOR UPDATE',
      [seedName],
    );
    if (previous.length) {
      if (previous[0].checksum !== checksum)
        throw new Error('Seed checksum changed after application. Add a new seed version.');
      await connection.commit();
      return 'Fictional seed already applied; no records overwritten.';
    }
    for (const statement of splitStatements(sql))
      await connection.query(statement.replace(/\bpayroll\b/g, 'payroll_records')); // Forward table rename; original seed checksum stays immutable.
    await connection.execute('INSERT INTO seed_runs(seed_name,checksum) VALUES (?,?)', [
      seedName,
      checksum,
    ]);
    await connection.commit();
    return 'Fictional records seeded atomically. Balances remain zero; demo users are disabled.';
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.query("SELECT RELEASE_LOCK(CONCAT('ledgerline:seed:',DATABASE()))");
  }
}
