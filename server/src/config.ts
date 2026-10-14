import { existsSync, readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
const env = fileURLToPath(new URL('../../.env', import.meta.url));
if (process.env.NODE_ENV !== 'production' && existsSync(env)) loadEnvFile(env);
export type AppConfig = {
  origin: string;
  production: boolean;
  secret: string;
  database: string;
  host: string;
  port: number;
  user: string;
  password: string;
  ssl?: { rejectUnauthorized: true; ca?: string };
  trustProxy: boolean;
};
export function config(): AppConfig {
  const production = process.env.NODE_ENV === 'production';
  const origin = process.env.APP_ORIGIN || (!production ? 'http://127.0.0.1:5173' : '');
  const url = new URL(origin);
  if (url.origin !== origin || (production && url.protocol !== 'https:'))
    throw new Error('APP_ORIGIN must be an exact origin, using HTTPS in production.');
  const secret = process.env.AUTH_SECRET || '';
  if (secret.length < 43) throw new Error('Configure AUTH_SECRET with at least 32 random bytes.');
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const user = process.env.MYSQL_RUNTIME_USER || '';
  const password = process.env.MYSQL_RUNTIME_PASSWORD || '';
  if (!user || !password || user === 'root')
    throw new Error('Configure a dedicated MYSQL_RUNTIME_USER and MYSQL_RUNTIME_PASSWORD.');
  const port = Number(process.env.MYSQL_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid MySQL port.');
  const tls = process.env.MYSQL_SSL === 'true';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !tls)
    throw new Error('Hosted MySQL requires verified TLS.');
  return {
    origin,
    production,
    secret,
    database: process.env.MYSQL_DATABASE || 'banking_payroll_db',
    host,
    port,
    user,
    password,
    trustProxy: process.env.VERCEL === '1',
    ...(tls
      ? {
          ssl: {
            rejectUnauthorized: true,
            ...(process.env.MYSQL_SSL_CA
              ? { ca: readFileSync(process.env.MYSQL_SSL_CA, 'utf8') }
              : {}),
          },
        }
      : {}),
  };
}
