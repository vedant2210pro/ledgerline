import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { connect, safeError } from '../config.ts';
import { snapshot, sameSource, assertKnownSource, sourceTables } from './inventory.ts';
import { backupLegacy, mysqlTool } from './backup.ts';
import { upgradeSchema } from './schema.ts';
import { importLegacy, verifyImport } from './import.ts';
import { rehearseImport } from './rehearsal.ts';
import { digest } from '../migrate.ts';
import { verify } from '../verify.ts';
import { verifyConvergence } from './convergence.ts';
const mode = process.argv[2];
let source: Connection | undefined, lock: Connection | undefined, clone: Connection | undefined;
try {
  assert(['rehearse', 'apply', 'verify'].includes(mode), 'Use rehearse, apply, or verify');
  assert(
    ['127.0.0.1', 'localhost', '::1'].includes(process.env.MYSQL_HOST || '127.0.0.1'),
    'This upgrade runner is for the approved local database only',
  );
  source = await connect('banking_payroll_db');
  if (mode === 'verify') {
    await verify(source);
    const current = await snapshot(source);
    console.log(JSON.stringify(await verifyImport(source, current), null, 2));
  } else {
    const [prior] = await source.query<RowDataPacket[]>(
      "SELECT COUNT(*) n FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='legacy_upgrade_migrations'",
    );
    assert.equal(
      Number(prior[0].n),
      0,
      'Upgrade already started or applied. Use db:upgrade:verify; inspect incomplete DDL before recovery.',
    );
    lock = await connect('banking_payroll_db');
    await lock.query('SET SESSION lock_wait_timeout=10');
    const [writers] = await source.query<RowDataPacket[]>(
      "SELECT COUNT(*) n FROM information_schema.processlist WHERE ID<>CONNECTION_ID() AND COMMAND NOT IN ('Sleep','Daemon') AND DB='banking_payroll_db'",
    );
    assert.equal(
      Number(writers[0].n),
      0,
      'Active legacy client detected; pause that client before retrying',
    );
    // Connection-owned READ locks block source DML and DDL until verification finishes.
    await lock.query('LOCK TABLES ' + sourceTables.map((t) => '`' + t + '` READ').join(','));
    const original = await snapshot(source);
    assertKnownSource(original);
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
    const backup = await backupLegacy(stamp);
    console.log('Source locked; private logical backup created and SHA-256 recorded.');
    const rehearsal = 'banking_payroll_rehearsal_' + stamp;
    assert(/^banking_payroll_rehearsal_\d{17}$/.test(rehearsal));
    await source.query(
      `CREATE DATABASE \`${rehearsal}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
    await mysqlTool(
      'mysql',
      ['--database=' + rehearsal],
      backup.sql.replaceAll('`banking_payroll_db`.', '`' + rehearsal + '`.'),
    );
    clone = await connect(rehearsal);
    const restored = await snapshot(clone);
    sameSource(original, restored);
    console.log('Backup restoration verified: all source rows, views and original triggers match.');
    await upgradeSchema(clone);
    const tests = await rehearseImport(clone, restored);
    const clean = await connect('banking_payroll_test');
    let convergence;
    try {
      convergence = await verifyConvergence(clean, clone);
    } finally {
      await clean.end();
    }
    await upgradeSchema(clone);
    sameSource(original, await snapshot(source));
    console.log(
      'Rehearsal passed: rollback, repeat import, frozen accounts and historical payroll guards.',
    );
    let applied = false;
    if (mode === 'apply') {
      await upgradeSchema(source);
      await verify(source);
      await importLegacy(source, original);
      await verifyImport(source, original);
      assert.equal(await importLegacy(source, original), 'already_imported');
      applied = true;
    }
    sameSource(original, await snapshot(source));
    assert.equal(
      digest(await readFile(backup.path, 'utf8')),
      backup.sha256,
      'Backup changed during upgrade',
    );
    const evidence = {
      at: new Date().toISOString(),
      applied,
      sourceSchema: 'banking_payroll_db',
      rehearsalSchema: rehearsal,
      backupPath: backup.path,
      backupSha256: backup.sha256,
      sourceDigest: original.inventoryDigest,
      counts: original.counts,
      views: 5,
      originalTriggers: 2,
      tests: { ...tests, ...convergence },
      ...(applied ? { verification: await verifyImport(source, original) } : {}),
    };
    await writeFile(
      new URL('evidence.json', backup.folder),
      JSON.stringify(evidence, null, 2) + '\n',
    );
    await writeFile(
      new URL('../../docs/LEGACY_UPGRADE_EVIDENCE.json', import.meta.url),
      JSON.stringify(evidence, null, 2) + '\n',
    );
    console.log(
      JSON.stringify(
        {
          applied,
          backup: backup.path,
          rehearsal,
          evidence: fileURLToPath(
            new URL('../../docs/LEGACY_UPGRADE_EVIDENCE.json', import.meta.url),
          ),
        },
        null,
        2,
      ),
    );
  }
} catch (error) {
  console.error(safeError(error));
  process.exitCode = 1;
} finally {
  await lock?.end();
  await clone?.end();
  await source?.end();
}
