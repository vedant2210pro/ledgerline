import { Router } from 'express';
import { createHash } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z, idSchema, cents, moneySchema } from '@ledgerline/shared';
import { transaction } from './db.ts';
import { permit, checkCsrf, type Identity } from './auth.ts';
import { ApiError } from './errors.ts';

const reviewSchema = z.strictObject({
  row_version: z.number().int().min(0),
  opening_balance: moneySchema,
  review_note: z.string().trim().min(10).max(1000),
  confirmed: z.literal(true),
});

async function details(
  db: PoolConnection,
  id: string,
  lock = false,
): Promise<Record<string, unknown> & { row_version: number; source_matches: boolean }> {
  // Lock account before its snapshot, matching account-update lock order.
  const [accounts] = await db.execute<RowDataPacket[]>(
    'SELECT account_id FROM accounts WHERE account_id=?' + (lock ? ' FOR UPDATE' : ''),
    [id],
  );
  if (!accounts.length) throw new ApiError(404, 'NOT_FOUND', 'Account not found.');
  const [snapshots] = await db.execute<RowDataPacket[]>(
    'SELECT account_id FROM account_opening_snapshots WHERE account_id=?' +
      (lock ? ' FOR UPDATE' : ''),
    [id],
  );
  if (!snapshots.length)
    throw new ApiError(404, 'NO_OPENING_REVIEW', 'This account has no imported opening balance.');
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT CAST(a.account_id AS CHAR) account_id,a.account_number,a.account_status,a.row_version,a.balance,
      s.opening_balance,r.net_movement,r.discrepancy,s.reconciliation_state,
      CAST(s.reviewed_by AS CHAR) reviewed_by,s.reviewed_at,s.review_note,b.imported_at,
      b.verification_status,CAST(l.source_id AS CHAR) source_account_id,l.source_digest
     FROM accounts a JOIN account_opening_snapshots s USING(account_id)
     JOIN v_account_reconciliation r USING(account_id)
     JOIN legacy_import_batches b ON b.batch_id=s.batch_id
     LEFT JOIN legacy_record_links l ON l.target_table='accounts' AND l.target_id=a.account_id
       AND l.source_table='account' AND l.batch_id=s.batch_id AND l.history_state='mapped'
     WHERE a.account_id=?`,
    [id],
  );
  const result = rows[0];
  let source: RowDataPacket | undefined;
  if (result.source_account_id) {
    const [tables] = await db.query<RowDataPacket[]>(
      "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='account'",
    );
    if (tables.length) {
      const [original] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM account WHERE account_id=?' + (lock ? ' FOR SHARE' : ''),
        [result.source_account_id],
      );
      source = original[0];
    }
  }
  const sourceMatches =
    !!source &&
    result.verification_status === 'verified' &&
    createHash('sha256').update(JSON.stringify(source)).digest('hex') === result.source_digest &&
    cents(String(source.balance)) === cents(String(result.opening_balance));
  const { verification_status: _verification, ...publicResult } = result;
  void _verification;
  return {
    ...publicResult,
    row_version: Number(result.row_version),
    source_balance: source ? String(source.balance) : null,
    source_matches: sourceMatches,
  };
}

export function openingReviewRouter(pool: Pool) {
  const router = Router();
  router.get('/accounts/:id/opening-review', permit('accounts.view'), async (req, res) => {
    const id = idSchema.parse(req.params.id);
    res.json(await transaction(pool, (db) => details(db, id)));
  });
  router.post(
    '/accounts/:id/opening-review',
    permit('users.administer'),
    permit('accounts.update'),
    checkCsrf,
    async (req, res) => {
      const id = idSchema.parse(req.params.id),
        input = reviewSchema.parse(req.body);
      const actor = (res.locals.identity as Identity).user.id;
      const result = await transaction(pool, async (db) => {
        // Recheck administrator authority in the same transaction as the review.
        const [admin] = await db.execute<RowDataPacket[]>(
          "SELECT u.user_id FROM users u JOIN user_roles ur USING(user_id) JOIN roles r USING(role_id) WHERE u.user_id=? AND u.account_status='active' AND r.role_name='administrator' FOR SHARE",
          [actor],
        );
        if (!admin.length)
          throw new ApiError(
            403,
            'FORBIDDEN',
            'An active administrator must review the opening balance.',
          );
        const before = await details(db, id, true);
        if (before.row_version !== input.row_version)
          throw new ApiError(
            409,
            'STALE_RECORD',
            'This account changed. Reload and review the current values.',
          );
        if (before.reconciliation_state !== 'pending')
          throw new ApiError(
            409,
            'ALREADY_REVIEWED',
            'This opening balance has already been reviewed. Reload the record.',
          );
        if (
          before.account_status !== 'frozen' ||
          !before.source_matches ||
          String(before.discrepancy) !== '0.00'
        )
          throw new ApiError(
            409,
            'REVIEW_BLOCKED',
            'Review blocked: the source record, opening balance or ledger does not reconcile. Keep the account frozen and investigate.',
          );
        if (cents(input.opening_balance) !== cents(String(before.opening_balance)))
          throw new ApiError(
            409,
            'BALANCE_CHANGED',
            'The opening balance does not match the value you reviewed.',
          );
        await db.execute(
          "UPDATE account_opening_snapshots SET reconciliation_state='reviewed',reviewed_by=?,reviewed_at=UTC_TIMESTAMP(6),review_note=? WHERE account_id=?",
          [actor, input.review_note, id],
        );
        await db.execute('UPDATE accounts SET row_version=row_version+1 WHERE account_id=?', [id]);
        const after = await details(db, id);
        await db.execute(
          'INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,before_values,after_values,http_request_id) VALUES (?,?,?,?,?,?,?)',
          [
            actor,
            'accounts.opening_review',
            'accounts',
            id,
            JSON.stringify(before),
            JSON.stringify(after),
            res.locals.requestId,
          ],
        );
        return after;
      });
      res.json(result);
    },
  );
  return router;
}
