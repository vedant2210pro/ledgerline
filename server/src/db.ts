import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';
import { attachDatabasePool } from '@vercel/functions';
import type { AppConfig } from './config.ts';
export function createPool(c: AppConfig): Pool {
  const pool = mysql.createPool({
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
    database: c.database,
    ssl: c.ssl,
    connectionLimit: 5,
    maxIdle: 2,
    idleTimeout: 10000,
    waitForConnections: true,
    queueLimit: 20,
    connectTimeout: 8000,
    decimalNumbers: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
    timezone: 'Z',
    charset: 'utf8mb4',
    multipleStatements: false,
  });
  // PromisePool forwards release events but does not expose the core pool config.
  if (c.trustProxy)
    attachDatabasePool({
      config: { idleTimeout: 10000 },
      on: (event: 'release', listener: () => void) => {
        pool.on(event, listener);
      },
    });
  return pool;
}
export async function connection(pool: Pool) {
  const db = await pool.getConnection();
  try {
    await db.query("SET SESSION time_zone='+00:00'");
    await db.query(
      "SET SESSION sql_mode='STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
    );
    await db.query('SET SESSION innodb_lock_wait_timeout=5');
    return db;
  } catch (e) {
    db.release();
    throw e;
  }
}
export async function read<T>(pool: Pool, work: (db: PoolConnection) => Promise<T>): Promise<T> {
  const db = await connection(pool);
  try {
    return await work(db);
  } finally {
    db.release();
  }
}
export async function transaction<T>(
  pool: Pool,
  work: (db: PoolConnection) => Promise<T>,
): Promise<T> {
  return read(pool, async (db) => {
    await db.beginTransaction();
    try {
      const result = await work(db);
      await db.commit();
      return result;
    } catch (e) {
      await db.rollback();
      throw e;
    }
  });
}
