import assert from 'node:assert/strict';
import type { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { digest } from '../migrate.ts';
import { snapshot, sameSource, type Snapshot, sourceTables, primaryKeys } from './inventory.ts';
const mapped: Record<string, string> = {
  customer: 'customers',
  employee: 'employees',
  branch: 'branches',
  account: 'accounts',
  payroll: 'payroll',
  bank_transaction: 'bank_transaction',
};
export async function importLegacy(db: Connection, expected: Snapshot, failAfter?: number) {
  const [lock] = await db.query<RowDataPacket[]>(
    "SELECT GET_LOCK(CONCAT('ledgerline:import:',DATABASE()),10) acquired",
  );
  assert.equal(Number(lock[0].acquired), 1, 'Import lock unavailable');
  try {
    await db.beginTransaction();
    sameSource(expected, await snapshot(db));
    const [existing] = await db.execute<RowDataPacket[]>(
      'SELECT batch_id,inventory_digest FROM legacy_import_batches FOR UPDATE',
    );
    if (existing.length) {
      assert.equal(existing.length, 1, 'Unexpected import batches');
      assert.equal(
        existing[0].inventory_digest,
        expected.inventoryDigest,
        'Source changed since import; incremental import requires review',
      );
      await verifyImport(db, expected);
      await db.commit();
      return 'already_imported';
    }
    for (const table of [
      'customers',
      'employees',
      'branches',
      'accounts',
      'payroll_records',
      'banking_transactions',
    ]) {
      const [count] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) n FROM ${table}`);
      assert.equal(Number(count[0].n), 0, 'Import requires empty modern business tables');
    }
    const [batch] = await db.execute<ResultSetHeader>(
      `INSERT INTO legacy_import_batches(source_schema,inventory_digest,importer_identity,row_counts) VALUES (DATABASE(),?,CURRENT_USER(),?)`,
      [expected.inventoryDigest, JSON.stringify(expected.counts)],
    );
    const batchId = batch.insertId;
    let imported = 0;
    for (const [index, table] of sourceTables.entries()) {
      for (const r of expected.rows[table]) {
        const id = r[primaryKeys[index]];
        if (table === 'customer')
          await db.execute(
            'INSERT INTO customers(customer_id,name,email,phone,address) VALUES (?,?,?,?,?)',
            [id, r.name, r.email, r.phone, r.address],
          );
        if (table === 'employee')
          await db.execute(
            "INSERT INTO employees(employee_id,employee_code,name,department,phone,email,designation,date_of_joining,employment_status,legacy_batch_id) VALUES (?,?,?,?,?,?,NULL,NULL,'legacy_incomplete',?)",
            [id, `LEGACY-E-${id}`, r.name, r.department, r.phone, r.email, batchId],
          );
        if (table === 'branch')
          await db.execute(
            'INSERT INTO branches(branch_id,branch_code,name,address,phone) VALUES (?,?,?,?,?)',
            [id, `LEGACY-B-${id}`, r.name, r.address, r.phone],
          );
        if (table === 'account') {
          await db.execute(
            "INSERT INTO accounts(account_id,account_number,customer_id,employee_id,account_type,balance,open_date,account_status) VALUES (?,?,?,?,?,?,?,'frozen')",
            [
              id,
              `LEGACY-A-${id}`,
              r.customer_id,
              r.employee_id,
              String(r.account_type).toLowerCase(),
              r.balance,
              r.open_date,
            ],
          );
          await db.execute(
            'INSERT INTO account_opening_snapshots(account_id,batch_id,opening_balance) VALUES (?,?,?)',
            [id, batchId, r.balance],
          );
        }
        if (table === 'payroll')
          await db.execute(
            'INSERT INTO legacy_payroll_periods(employee_id,candidate_period,source_payroll_id,batch_id) VALUES (?,?,?,?)',
            [r.employee_id, String(r.pay_date).slice(0, 7) + '-01', id, batchId],
          );
        const state =
          table === 'bank_transaction' && r.transaction_type === 'Transfer'
            ? 'unresolved_transfer'
            : ['payroll', 'bank_transaction'].includes(table)
              ? 'historical_only'
              : 'mapped';
        await db.execute(
          'INSERT INTO legacy_record_links(source_table,source_id,target_table,target_id,batch_id,source_digest,history_state) VALUES (?,?,?,?,?,?,?)',
          [table, id, mapped[table], id, batchId, digest(JSON.stringify(r)), state],
        );
        if (++imported === failAfter) throw new Error('Injected import failure');
      }
    }
    await verifyImport(db, expected);
    await db.execute(
      "UPDATE legacy_import_batches SET verification_status='verified' WHERE batch_id=?",
      [batchId],
    );
    await db.commit();
    return 'imported';
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.query("SELECT RELEASE_LOCK(CONCAT('ledgerline:import:',DATABASE()))");
  }
}
export async function verifyImport(db: Connection, expected: Snapshot) {
  sameSource(expected, await snapshot(db));
  const [batches] = await db.query<RowDataPacket[]>(
    'SELECT batch_id,inventory_digest,row_counts FROM legacy_import_batches',
  );
  assert.equal(batches.length, 1, 'Expected exactly one import batch');
  assert.equal(
    batches[0].inventory_digest,
    expected.inventoryDigest,
    'Legacy source changed since import',
  );
  assert.deepEqual(batches[0].row_counts, expected.counts, 'Imported source counts changed');
  for (const table of [
    'legacy_record_links',
    'account_opening_snapshots',
    'legacy_payroll_periods',
  ]) {
    const [wrong] = await db.execute<RowDataPacket[]>(
      `SELECT COUNT(*) n FROM ${table} WHERE batch_id<>?`,
      [batches[0].batch_id],
    );
    assert.equal(Number(wrong[0].n), 0, 'Provenance batch mismatch');
  }
  for (const [index, table] of sourceTables.entries()) {
    const [links] = await db.execute<RowDataPacket[]>(
      'SELECT source_id,target_table,target_id,source_digest,history_state FROM legacy_record_links WHERE source_table=? ORDER BY source_id',
      [table],
    );
    assert.equal(links.length, expected.rows[table].length, 'Link count mismatch');
    for (const [i, r] of expected.rows[table].entries()) {
      const link = links[i];
      assert.equal(
        String(link.source_id),
        String(r[primaryKeys[index]]),
        'Source link ID mismatch',
      );
      assert.equal(String(link.target_id), String(link.source_id), 'Mapped ID mismatch');
      assert.equal(link.target_table, mapped[table], 'Mapped table mismatch');
      assert.equal(link.source_digest, digest(JSON.stringify(r)), 'Per-row source digest mismatch');
      assert.equal(
        link.history_state,
        table === 'bank_transaction' && r.transaction_type === 'Transfer'
          ? 'unresolved_transfer'
          : ['payroll', 'bank_transaction'].includes(table)
            ? 'historical_only'
            : 'mapped',
      );
    }
  }
  const projections: Record<string, string> = {
    customer: 'customer_id,name,email,phone,address',
    employee: 'employee_id,name,department,phone,email',
    branch: 'branch_id,name,address,phone',
    account: 'account_id,customer_id,employee_id,account_type,balance,open_date',
  };
  for (const [table, fields] of Object.entries(projections)) {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT ${fields} FROM ${mapped[table]} ORDER BY ${fields.split(',')[0]}`,
    );
    const normalized = expected.rows[table].map((r) =>
      Object.fromEntries(
        fields
          .split(',')
          .map((k) => [k, k === 'account_type' ? String(r[k]).toLowerCase() : String(r[k])]),
      ),
    );
    const target = rows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])),
    );
    assert.equal(
      digest(JSON.stringify(target)),
      digest(JSON.stringify(normalized)),
      `Exact field comparison failed: ${table}`,
    );
  }
  const [checks] = await db.query<RowDataPacket[]>(`SELECT
 (SELECT COUNT(*) FROM accounts WHERE account_status<>'frozen') nonfrozen,
 (SELECT COUNT(*) FROM employees WHERE employment_status<>'legacy_incomplete' OR designation IS NOT NULL OR date_of_joining IS NOT NULL OR legacy_batch_id IS NULL) fabricated,
 (SELECT COUNT(*) FROM account_opening_snapshots s JOIN accounts a USING(account_id) WHERE s.opening_balance<>a.balance OR s.reconciliation_state<>'pending') snapshot_mismatch,
 (SELECT COUNT(*) FROM account_opening_snapshots) snapshots,
 (SELECT COUNT(*) FROM legacy_payroll_periods) periods,
 (SELECT COUNT(*) FROM payroll_records) modern_payroll,
 (SELECT COUNT(*) FROM banking_transactions) modern_postings,
 (SELECT COUNT(*) FROM accounts WHERE account_number<>CONCAT('LEGACY-A-',account_id)) account_codes,
 (SELECT COUNT(*) FROM branches WHERE branch_code<>CONCAT('LEGACY-B-',branch_id)) branch_codes,
 (SELECT COUNT(*) FROM employees WHERE employee_code<>CONCAT('LEGACY-E-',employee_id)) employee_codes,
 (SELECT COALESCE(SUM(balance),0) FROM account) original_total,
 (SELECT COALESCE(SUM(balance),0) FROM accounts) imported_total`);
  const c = checks[0];
  for (const key of [
    'nonfrozen',
    'fabricated',
    'snapshot_mismatch',
    'modern_payroll',
    'modern_postings',
    'account_codes',
    'branch_codes',
    'employee_codes',
  ])
    assert.equal(Number(c[key]), 0, `Import verification failed: ${key}`);
  assert.equal(Number(c.snapshots), expected.counts.account);
  assert.equal(Number(c.periods), expected.counts.payroll);
  assert.equal(c.original_total, c.imported_total, 'Balance totals differ');
  const [periods] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) n FROM legacy_payroll_periods l JOIN payroll p ON p.payroll_id=l.source_payroll_id WHERE l.employee_id<>p.employee_id OR l.candidate_period<>DATE_FORMAT(p.pay_date,'%Y-%m-01')`,
  );
  assert.equal(Number(periods[0].n), 0, 'Historical payroll period mapping mismatch');
  return {
    sourceRows: Object.values(expected.counts).reduce((a, b) => a + b, 0),
    mappedCoreRows: 40,
    frozenAccounts: Number(c.snapshots),
    historicalPayrollPeriods: Number(c.periods),
    unresolvedTransfers: expected.rows.bank_transaction.filter(
      (r) => r.transaction_type === 'Transfer',
    ).length,
    inventoryDigest: expected.inventoryDigest,
    status: 'verified',
  };
}
