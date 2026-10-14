import { connect, safeError } from '../../database/config.ts';
let db: Awaited<ReturnType<typeof connect>> | undefined;
try {
  db = await connect(process.env.MYSQL_DATABASE || 'banking_payroll_db');
  // Bounded maintenance batches. Runtime API credentials have no DELETE grants.
  for (const sql of [
    'DELETE FROM login_attempts WHERE attempted_at<UTC_TIMESTAMP(6)-INTERVAL 7 DAY LIMIT 5000',
    'DELETE FROM login_throttles WHERE window_start<UTC_TIMESTAMP(6)-INTERVAL 1 DAY LIMIT 5000',
    'DELETE FROM sessions WHERE expires_at<UTC_TIMESTAMP(6)-INTERVAL 1 DAY LIMIT 5000',
  ])
    await db.query(sql);
  console.log('Expired authentication metadata cleanup batch completed. Audit history retained.');
} catch (e) {
  console.error(safeError(e));
  process.exitCode = 1;
} finally {
  await db?.end();
}
