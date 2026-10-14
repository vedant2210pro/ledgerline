import { app, pool } from './runtime.ts';
const port = Number(process.env.API_PORT || 3001);
const server = app.listen(port, '127.0.0.1', () =>
  console.log(`Ledgerline API: http://127.0.0.1:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  });
