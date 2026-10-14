import assert from 'node:assert/strict';
import type { Connection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { importLegacy, verifyImport } from './import.ts';
import type { Snapshot } from './inventory.ts';
async function signal(db: Connection, sql: string, values: (string | number)[] = []) {
  await assert.rejects(
    db.execute(sql, values),
    (e: unknown) => !!e && typeof e === 'object' && 'code' in e && e.code === 'ER_SIGNAL_EXCEPTION',
  );
}
export async function rehearseImport(db: Connection, source: Snapshot) {
  // Fail after some inserts in each phase, including snapshots and historical reservations.
  for (const failAt of [1, 15, 35, 45, 61]) {
    await assert.rejects(importLegacy(db, source, failAt), /Injected import failure/);
    for (const table of [
      'legacy_import_batches',
      'legacy_record_links',
      'customers',
      'employees',
      'branches',
      'accounts',
      'account_opening_snapshots',
      'legacy_payroll_periods',
    ]) {
      const [rows] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) n FROM ${table}`);
      assert.equal(Number(rows[0].n), 0, `Rollback left rows in ${table}`);
    }
  }
  assert.equal(await importLegacy(db, source), 'imported');
  assert.equal(await importLegacy(db, source), 'already_imported');
  await verifyImport(db, source);
  await db.beginTransaction();
  try {
    const [u] = await db.execute<ResultSetHeader>(
      "INSERT INTO users(name,email,account_status) VALUES ('Upgrade test','upgrade-test@example.test','disabled')",
    );
    const user = u.insertId;
    const [request] = await db.execute<ResultSetHeader>(
      "INSERT INTO operation_requests(actor_id,operation,idempotency_key,payload_hash) VALUES (?,'deposit','upgrade-test',UNHEX(SHA2('test',256)))",
      [user],
    );
    const account = source.rows.account[0].account_id;
    const branch = source.rows.branch[0].branch_id;
    await signal(db, "UPDATE accounts SET account_status='active' WHERE account_id=?", [account]);
    await signal(
      db,
      `INSERT INTO banking_transactions(account_id,branch_id,request_id,created_by,transaction_type,amount,balance_after,reference_number,description) VALUES (?,?,?,?,'deposit',1,1,'upgrade-frozen-test','Rehearsal')`,
      [account, branch, request.insertId, user],
    );
    const pay = source.rows.payroll[0];
    const period = String(pay.pay_date).slice(0, 7) + '-01';
    const payrollSql =
      'INSERT INTO payroll_records(employee_id,salary_amount,bonus,deductions,gross_salary,net_salary,payroll_period,created_by) VALUES (?,100,0,0,100,100,?,?)';
    await signal(db, payrollSql, [pay.employee_id, period, user]);
    const [p] = await db.execute<ResultSetHeader>(payrollSql, [
      pay.employee_id,
      '2099-01-01',
      user,
    ]);
    await signal(db, 'UPDATE payroll_records SET payroll_period=? WHERE payroll_id=?', [
      period,
      p.insertId,
    ]);
    await assert.rejects(
      db.execute(
        "INSERT INTO employees(employee_code,name,department,phone,email) VALUES ('MISSING','Missing','Test','Test','missing@example.test')",
      ),
      (e: unknown) =>
        !!e && typeof e === 'object' && 'code' in e && e.code === 'ER_CHECK_CONSTRAINT_VIOLATED',
    );
    await db.execute(
      "UPDATE account_opening_snapshots SET reconciliation_state='reviewed',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP(6),review_note='Rehearsal only' WHERE account_id=?",
      [user, account],
    );
    await db.execute("UPDATE accounts SET account_status='active' WHERE account_id=?", [account]);
  } finally {
    await db.rollback();
  }
  await verifyImport(db, source);
  return {
    faultInjectionRollbacks: 5,
    idempotentImport: true,
    frozenPostingBlocked: true,
    activationRequiresReview: true,
    historicalPayrollInsertAndUpdateBlocked: true,
    newEmployeeFieldsRequired: true,
  };
}
