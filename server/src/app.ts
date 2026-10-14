import express from 'express';
import helmet from 'helmet';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { AppConfig } from './config.ts';
import { authRouter, authenticate } from './auth.ts';
import { analyticsRouter } from './analytics.ts';
import { adminRouter } from './admin.ts';
import { financeRouter } from './finance.ts';
import { recordsRouter } from './records.ts';
import { ApiError, errors, requestId } from './errors.ts';
import { read } from './db.ts';
export function createApp(pool: Pool, c: AppConfig) {
  const app = express();
  app.disable('x-powered-by');
  // Vercel overwrites forwarding headers; local/Vite traffic never trusts client-supplied XFF.
  if (c.trustProxy) app.set('trust proxy', 1);
  app.use(helmet());
  app.use(requestId);
  app.use((req, res, next) => {
    const origin = req.get('Origin');
    if (origin && origin !== c.origin)
      throw new ApiError(403, 'ORIGIN_REJECTED', 'This request origin is not allowed.');
    if (origin === c.origin) {
      res.setHeader('Access-Control-Allow-Origin', c.origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.vary('Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-CSRF-Token');
      res.status(204).end();
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (origin !== c.origin)
        throw new ApiError(403, 'ORIGIN_REJECTED', 'A trusted Origin header is required.');
      if (!req.is('application/json'))
        throw new ApiError(415, 'JSON_REQUIRED', 'Send application/json.');
    }
    next();
  });
  app.use(express.json({ limit: '16kb', strict: true }));
  app.get('/api/v1/health/live', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/v1/health/ready', async (_req, res) => {
    try {
      await read(pool, async (db) => {
        const [r] = await db.query<RowDataPacket[]>(
          "SELECT COUNT(*) AS n FROM permissions WHERE permission_code='customers.view'",
        );
        if (Number(r[0].n) !== 1) throw new Error('Schema unavailable');
        await db.query('SELECT attempt_count FROM login_throttles LIMIT 0');
        await db.query('SELECT row_version FROM users LIMIT 0');
        await db.query('SELECT row_version FROM employees LIMIT 0');
        await db.query('SELECT row_version FROM payroll_records LIMIT 0');
        const [routines] = await db.query<RowDataPacket[]>(
          "SELECT COUNT(*) n FROM information_schema.routines WHERE ROUTINE_SCHEMA=DATABASE() AND ROUTINE_NAME IN ('sp_deposit_money','sp_withdraw_money','sp_transfer_money','sp_reverse_transaction','sp_process_payroll','calculate_net_salary')",
        );
        if (Number(routines[0].n) !== 6) throw new Error('Financial procedures unavailable');
      });
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({
        error: {
          code: 'NOT_READY',
          message: 'The service is not ready.',
          requestId: res.locals.requestId,
        },
      });
    }
  });
  app.use('/api/v1/auth', authRouter(pool, c));
  app.use(
    '/api/v1',
    authenticate(pool, c),
    recordsRouter(pool),
    financeRouter(pool),
    analyticsRouter(pool),
    adminRouter(pool),
  );
  app.use(() => {
    throw new ApiError(404, 'NOT_FOUND', 'This endpoint does not exist.');
  });
  app.use(errors);
  return app;
}
