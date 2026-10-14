import assert from 'node:assert/strict';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { digest } from '../migrate.ts';
export const sourceTables = [
  'customer',
  'employee',
  'branch',
  'account',
  'payroll',
  'bank_transaction',
] as const;
export const primaryKeys = [
  'customer_id',
  'employee_id',
  'branch_id',
  'account_id',
  'payroll_id',
  'transaction_id',
];
export type Snapshot = Awaited<ReturnType<typeof snapshot>>;
// Source rows stay in process memory and the private backup; public evidence contains only hashes/counts.
export async function snapshot(db: Connection) {
  const [schema] = await db.query<RowDataPacket[]>('SELECT DATABASE() AS name');
  const name = String(schema[0].name);
  const canonical = (value: unknown) =>
    String(value)
      .replaceAll('`' + name + '`.', '`SOURCE`.')
      .replace(/AUTO_INCREMENT=\d+ /g, '');
  const rows: Record<string, RowDataPacket[]> = {};
  const definitions: Record<string, string> = {};
  for (const [i, table] of sourceTables.entries()) {
    [rows[table]] = await db.query<RowDataPacket[]>(
      `SELECT * FROM \`${table}\` ORDER BY ${primaryKeys[i]}`,
    );
    const [ddl] = await db.query<RowDataPacket[]>(`SHOW CREATE TABLE \`${table}\``);
    definitions[table] = canonical(ddl[0]['Create Table']);
  }
  const [views] = await db.query<RowDataPacket[]>(
    "SELECT TABLE_NAME FROM information_schema.views WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('account_transaction_view','branch_transaction_view','customer_account_view','employee_payroll_view','high_balance_account_view') ORDER BY TABLE_NAME",
  );
  assert.equal(views.length, 5, 'Expected five legacy views');
  for (const view of views) {
    const [ddl] = await db.query<RowDataPacket[]>(`SHOW CREATE VIEW \`${view.TABLE_NAME}\``);
    definitions[view.TABLE_NAME] = canonical(ddl[0]['Create View']);
    await db.query(`SELECT * FROM \`${view.TABLE_NAME}\` LIMIT 0`);
  }
  const [triggers] = await db.query<RowDataPacket[]>(
    "SELECT TRIGGER_NAME,EVENT_MANIPULATION,EVENT_OBJECT_TABLE,ACTION_TIMING,ACTION_STATEMENT,SQL_MODE,DEFINER FROM information_schema.triggers WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE IN ('customer','employee','branch','account','payroll','bank_transaction') ORDER BY TRIGGER_NAME",
  );
  assert.equal(triggers.length, 2, 'Expected two legacy triggers');
  definitions.triggers = canonical(JSON.stringify(triggers));
  const rowHashes = Object.fromEntries(
    sourceTables.map((t) => [t, rows[t].map((r) => digest(JSON.stringify(r)))]),
  );
  const counts = Object.fromEntries(sourceTables.map((t) => [t, rows[t].length]));
  const inventoryDigest = digest(JSON.stringify({ definitions, rowHashes }));
  return { rows, definitions, rowHashes, counts, inventoryDigest };
}
export function sameSource(a: Snapshot, b: Snapshot) {
  assert.equal(
    b.inventoryDigest,
    a.inventoryDigest,
    'Legacy definitions or per-row hashes changed',
  );
}
export function assertKnownSource(s: Snapshot) {
  assert.deepEqual(
    s.counts,
    { customer: 10, employee: 10, branch: 10, account: 10, payroll: 11, bank_transaction: 10 },
    'Source inventory changed; review upgrade before proceeding',
  );
  assert(
    s.rows.account.every((r) => ['Savings', 'Current'].includes(r.account_type)),
    'Unmapped account type',
  );
  assert(
    s.rows.bank_transaction.every((r) =>
      ['Deposit', 'Withdrawal', 'Transfer'].includes(r.transaction_type),
    ),
    'Unmapped transaction type',
  );
}
