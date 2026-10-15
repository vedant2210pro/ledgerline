import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/context';
import { money, useRemote } from '../../hooks/useRemote';
import { api, RequestError } from '../../services/api';
import { ErrorNotice } from './Controls';

type OpeningReview = {
  account_id: string;
  account_number: string;
  account_status: string;
  row_version: number;
  balance: string;
  opening_balance: string;
  net_movement: string;
  discrepancy: string;
  reconciliation_state: 'pending' | 'reviewed';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  source_account_id: string;
  source_digest: string;
  imported_at: string;
  source_matches: boolean;
  source_balance?: string | null;
};

export default function OpeningBalanceReview(props: { accountId: string; onReviewed: () => void }) {
  // A different account always needs a fresh confirmation and note.
  return <ReviewPanel key={props.accountId} {...props} />;
}

function ReviewPanel({ accountId, onReviewed }: { accountId: string; onReviewed: () => void }) {
  const { user } = useAuth();
  const canView = !!user?.permissions.includes('accounts.view');
  const administrator = !!user?.roles.includes('administrator');
  const path = '/accounts/' + encodeURIComponent(accountId) + '/opening-review';
  const remote = useRemote<OpeningReview>(path, canView);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<OpeningReview | null>(null);
  const confirmation = useRef<HTMLElement>(null);
  const record = saved || remote.data;
  const reviewed = record?.reconciliation_state === 'reviewed';
  const eligible = !!record && record.source_matches && /^-?0(?:\.0+)?$/.test(record.discrepancy);

  useEffect(() => {
    if (pending) confirmation.current?.focus();
  }, [pending]);

  function reload() {
    setPending(false);
    setConfirmed(false);
    setError('');
    remote.reload();
  }

  async function save() {
    if (!record || !administrator || !eligible || reviewed || !pending || !confirmed || busy)
      return;
    setBusy(true);
    setError('');
    try {
      const result = await api<OpeningReview>(path, {
        method: 'POST',
        body: JSON.stringify({
          row_version: record.row_version,
          opening_balance: record.opening_balance,
          review_note: note.trim(),
          confirmed: true,
        }),
      });
      setSaved(result);
      setPending(false);
      setConfirmed(false);
      onReviewed();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to save the opening balance review.';
      setPending(false);
      setConfirmed(false);
      if (e instanceof RequestError && e.status === 409) {
        setError(
          'Review was not saved. ' +
            message +
            ' Reloading details; compare them again before confirming.',
        );
        remote.reload();
      } else setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (!canView) return null;
  return (
    <section
      className="records-panel related-records"
      aria-labelledby={'opening-review-' + accountId}
    >
      <h2 id={'opening-review-' + accountId}>Opening balance review</h2>
      <p>
        Imported balances are preserved from the original database. Review the source and the
        reconciliation before confirming an opening balance.
      </p>
      <ErrorNotice message={error || remote.error} />
      {remote.loading && !saved ? (
        <p role="status">Loading opening balance details…</p>
      ) : remote.error && !saved ? (
        <button type="button" className="button button-outline" onClick={reload}>
          Reload review
        </button>
      ) : record ? (
        <>
          <dl className="review-details">
            <div>
              <dt>Imported opening balance</dt>
              <dd>{money(record.opening_balance)}</dd>
            </div>
            <div>
              <dt>Original source balance</dt>
              <dd>
                {record.source_balance == null ? 'Unavailable' : money(record.source_balance)}
              </dd>
            </div>
            <div>
              <dt>Current account balance</dt>
              <dd>{money(record.balance)}</dd>
            </div>
            <div>
              <dt>Net ledger movement since import</dt>
              <dd>{money(record.net_movement)}</dd>
            </div>
            <div>
              <dt>Reconciliation discrepancy</dt>
              <dd>{money(record.discrepancy)}</dd>
            </div>
            <div>
              <dt>Original source check</dt>
              <dd>
                {record.source_matches ? 'Matches the saved import' : 'Source missing or changed'}
              </dd>
            </div>
          </dl>
          <p>Reconciliation: opening balance + net ledger movement = current account balance.</p>
          <details className="permission-details">
            <summary>Original import details</summary>
            <dl className="review-details">
              <div>
                <dt>Original account ID</dt>
                <dd>{record.source_account_id}</dd>
              </div>
              <div>
                <dt>Imported at (UTC)</dt>
                <dd>{record.imported_at}</dd>
              </div>
              <div>
                <dt>Source fingerprint (SHA-256)</dt>
                <dd>{record.source_digest}</dd>
              </div>
            </dl>
            <p>
              The source fingerprint checks that the retained original record matches the imported
              record. Compare the balances above with your original account statement or lab
              records.
            </p>
          </details>
          {reviewed ? (
            <div className="notice success" role="status">
              <strong>Opening balance reviewed</strong>
              <p>
                Reviewed by user #{record.reviewed_by} on {record.reviewed_at} (UTC).
              </p>
              <p>{record.review_note}</p>
              <p>
                Account status: {record.account_status}. You can now save a permitted status change
                in the account form. Reviewing the balance does not activate the account.
              </p>
            </div>
          ) : !administrator ? (
            <p className="notice">
              Ask an administrator to review this imported opening balance. The account must remain
              frozen until the review is complete.
            </p>
          ) : !eligible ? (
            <div className="notice error" role="alert">
              <p>
                Review is blocked because the original source does not match or the reconciliation
                has a discrepancy. Check the import and ledger records before proceeding.
              </p>
              <button type="button" className="button button-outline" onClick={reload}>
                Reload review
              </button>
            </div>
          ) : (
            <>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setError('');
                  if (!confirmed || note.trim().length < 10 || note.trim().length > 1000) {
                    setError(
                      'Confirm the source comparison and enter a review note of 10 to 1,000 characters.',
                    );
                    return;
                  }
                  setPending(true);
                }}
              >
                <fieldset className="admin-fieldset" disabled={pending || busy}>
                  <div className="role-choices">
                    <label style={{ textTransform: 'none', alignItems: 'flex-start' }}>
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(event) => setConfirmed(event.target.checked)}
                        style={{ flexShrink: 0 }}
                      />
                      I compared this opening balance with the original record and confirm it is
                      correct.
                    </label>
                  </div>
                  <label className="field">
                    Review note
                    <textarea
                      required
                      minLength={10}
                      maxLength={1000}
                      rows={3}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Describe which source you checked and why the opening balance is correct."
                    />
                  </label>
                  <p>
                    The review records your identity, time and note. The balance and account status
                    remain unchanged.
                  </p>
                  <button
                    className="button"
                    type="submit"
                    disabled={!confirmed || note.trim().length < 10}
                  >
                    Review confirmation
                  </button>
                </fieldset>
              </form>
              {pending && (
                <section
                  ref={confirmation}
                  tabIndex={-1}
                  className="workflow-actions"
                  aria-label="Confirm opening balance review"
                >
                  <h3>Confirm opening balance review</h3>
                  <p>
                    {record.account_number} · Opening balance {money(record.opening_balance)}
                  </p>
                  <p>{note.trim()}</p>
                  <p>
                    This saves the review in the audit history. The account stays{' '}
                    {record.account_status}.
                  </p>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => void save()}
                    >
                      {busy ? 'Saving review…' : 'Confirm review'}
                    </button>
                    <button
                      type="button"
                      className="button button-outline"
                      disabled={busy}
                      onClick={() => setPending(false)}
                    >
                      Back to review
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
