import { connect, safeError, schemaName } from './config.ts';
import { verifyFinancial } from './reports.ts';
const db = await connect(schemaName(process.argv.includes('--test')));
try {
  console.log(JSON.stringify(await verifyFinancial(db), null, 2));
} catch (e) {
  console.error(safeError(e));
  process.exitCode = 1;
} finally {
  await db.end();
}
