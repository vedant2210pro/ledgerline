import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { digest } from '../migrate.ts';
const bin = 'C:/Program Files/MySQL/MySQL Server 8.0/bin/';
export async function mysqlTool(tool: 'mysql' | 'mysqldump', args: string[], input?: string) {
  // Password is passed only in the child process environment, never command arguments or logs.
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      bin + tool + '.exe',
      [
        '--host=' + (process.env.MYSQL_HOST || '127.0.0.1'),
        '--port=' + (process.env.MYSQL_PORT || '3306'),
        '--user=' + process.env.MYSQL_USER,
        '--default-character-set=utf8mb4',
        ...args,
      ],
      {
        env: { ...process.env, MYSQL_PWD: process.env.MYSQL_PASSWORD },
        windowsHide: true,
        stdio: ['pipe', 'ignore', 'pipe'],
      },
    );
    // Do not retain stderr: vendor errors can contain SQL and personal records.
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', () =>
      reject(new Error(`${tool} could not start; check the configured MySQL binary path`)),
    );
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${tool} failed with exit code ${code}; no SQL or credentials logged`)),
    );
    child.stdin.end(input);
  });
}
export async function backupLegacy(stamp: string) {
  const folder = new URL(`../backups/${stamp}/`, import.meta.url);
  await mkdir(folder, { recursive: true });
  const path = fileURLToPath(new URL('legacy.sql', folder));
  await mysqlTool('mysqldump', [
    '--single-transaction',
    '--skip-lock-tables',
    '--routines',
    '--events',
    '--triggers',
    '--hex-blob',
    '--no-tablespaces',
    '--set-gtid-purged=OFF',
    '--result-file=' + path,
    'banking_payroll_db',
  ]);
  const sql = await readFile(path, 'utf8');
  await writeFile(new URL('legacy.sql.sha256', folder), digest(sql) + '\n');
  return { folder, path, sql, sha256: digest(sql) };
}
