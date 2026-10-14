import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';

export const rootEnv = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(rootEnv)) loadEnvFile(rootEnv);

export function schemaName(test = false): string {
  const name = test ? 'banking_payroll_test' : process.env.MYSQL_DATABASE || 'banking_payroll_db';
  if (!['banking_payroll_db', 'banking_payroll_test'].includes(name)) {
    throw new Error(
      'These development tools only manage banking_payroll_db or banking_payroll_test.',
    );
  }
  return name;
}

export async function connect(database?: string): Promise<Connection> {
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  if (!user || password === undefined || password === 'replace_locally') {
    throw new Error(
      'Configure MYSQL_USER and MYSQL_PASSWORD in the ignored repository-root .env file.',
    );
  }
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('MYSQL_PORT must be a valid port.');
  const tls = process.env.MYSQL_SSL === 'true';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !tls) {
    throw new Error('Remote database connections require MYSQL_SSL=true with verified TLS.');
  }
  const caPath = process.env.MYSQL_SSL_CA;
  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    connectTimeout: 8000,
    multipleStatements: false,
    decimalNumbers: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
    timezone: 'Z',
    charset: 'utf8mb4',
    ssl: tls
      ? { rejectUnauthorized: true, ...(caPath ? { ca: readFileSync(caPath, 'utf8') } : {}) }
      : undefined,
  });
  try {
    await connection.query("SET SESSION time_zone = '+00:00'");
    await connection.query(
      "SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
    );
    await connection.query('SET SESSION innodb_lock_wait_timeout = 10');
    await requireMysql8(connection);
    return connection;
  } catch (error) {
    await connection.end();
    throw error;
  }
}

export async function requireMysql8(connection: Connection): Promise<string> {
  const [rows] = await connection.query<RowDataPacket[]>('SELECT VERSION() AS version');
  const version = String(rows[0].version);
  const [major, minor, patch] = version.split('.').map(Number);
  if (/mariadb/i.test(version) || major !== 8 || (minor === 0 && patch < 16)) {
    throw new Error(
      'MySQL 8.0.16 or newer in the MySQL 8 family is required for enforced CHECK constraints.',
    );
  }
  return version;
}

export function safeError(error: unknown): string {
  // Never print connection options, SQL statements, stack traces or raw driver messages.
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    const hints: Record<string, string> = {
      ER_ACCESS_DENIED_ERROR: 'Check the local username/password and MySQL host grants.',
      ER_DBACCESS_DENIED_ERROR:
        'The migration user needs access to the named development database.',
      ECONNREFUSED: 'Check that MySQL80 is running and the host/port are correct.',
      ETIMEDOUT: 'Check database networking and TLS configuration.',
      ER_TABLEACCESS_DENIED_ERROR: 'The migration user needs the documented schema privileges.',
      ER_BAD_DB_ERROR: 'Run npm run db:init first.',
    };
    return `${code}: ${hints[code] || 'Database operation failed. Inspect the schema and grants locally; no SQL or secrets were logged.'}`;
  }
  return error instanceof Error ? error.message : 'Unexpected database operation failure.';
}
