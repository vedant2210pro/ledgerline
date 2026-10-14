import { connect, requireMysql8, safeError, schemaName } from './config.ts';
import { ensureDatabase, migrate } from './migrate.ts';
import { seed } from './seed.ts';
import { verify } from './verify.ts';
import type { Connection, RowDataPacket } from 'mysql2/promise';

let connection: Connection | undefined;
try {
  const command = process.argv[2];
  if (!['check', 'init', 'migrate', 'seed', 'verify'].includes(command))
    throw new Error('Use check, init, migrate, seed, or verify.');
  const name = schemaName();
  connection = await connect(command === 'init' || command === 'check' ? undefined : name);
  if (command === 'check') {
    const version = await requireMysql8(connection);
    const [settings] = await connection.query<RowDataPacket[]>(
      'SELECT @@session.sql_mode AS sql_mode,@@session.time_zone AS time_zone,@@transaction_isolation AS isolation_level',
    );
    console.log(
      JSON.stringify({ connected: true, version, settings: settings[0], target: name }, null, 2),
    );
  } else if (command === 'init') {
    await ensureDatabase(connection, name);
    console.log(JSON.stringify(await migrate(connection, name), null, 2));
  } else if (command === 'migrate') {
    console.log(JSON.stringify(await migrate(connection, name), null, 2));
  } else if (command === 'seed') {
    console.log(await seed(connection, process.env.ALLOW_DEMO_SEED === 'true'));
  } else {
    console.log(JSON.stringify(await verify(connection), null, 2));
  }
} catch (error) {
  console.error(safeError(error));
  process.exitCode = 1;
} finally {
  await connection?.end();
}
