import type { Connection, RowDataPacket } from 'mysql2/promise';
export async function grantOpeningReview(db: Connection, schema: string, user: string) {
  if (
    !['banking_payroll_db', 'banking_payroll_test'].includes(schema) ||
    !/^ledgerline_app_[a-f0-9]{8}$/.test(user)
  )
    throw new Error('Unexpected grant target');
  await db.query(
    `GRANT SELECT, UPDATE (reconciliation_state,reviewed_by,reviewed_at,review_note) ON \`${schema}\`.account_opening_snapshots TO ?@?`,
    [user, 'localhost'],
  );
  for (const table of ['legacy_import_batches', 'legacy_record_links'])
    await db.query(`GRANT SELECT ON \`${schema}\`.\`${table}\` TO ?@?`, [user, 'localhost']);
  const [tables] = await db.execute<RowDataPacket[]>(
    "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA=? AND TABLE_NAME='account'",
    [schema],
  );
  if (tables.length)
    await db.query(`GRANT SELECT ON \`${schema}\`.account TO ?@?`, [user, 'localhost']);
}
