/* eslint-disable react-hooks/set-state-in-effect -- Fetch state changes when filters or a successful posting change. */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  postingSchema,
  transferSchema,
  reversalSchema,
  type PageResult,
  type RecordItem,
} from '@ledgerline/shared';
import { api, RequestError } from '../services/api';
import { useAuth } from '../auth/context';
import { LookupSelect, Pager, ErrorNotice } from '../components/finance/Controls';
type Pending = {
  path: string;
  body: Record<string, string>;
  label: string;
  attempted: boolean;
  labels?: Record<string, string>;
};
type Receipt = { reference_number: string; replayed: boolean };
export default function TransactionsPage() {
  const { user } = useAuth(),
    [params, setParams] = useSearchParams();
  const storage = 'ledgerline:posting:' + user?.id;
  const [operation, setOperation] = useState('deposit'),
    [account, setAccount] = useState(''),
    [destination, setDestination] = useState(''),
    [branch, setBranch] = useState(''),
    [amount, setAmount] = useState(''),
    [description, setDescription] = useState('');
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storage) || 'null');
    } catch {
      return null;
    }
  });
  const [receipt, setReceipt] = useState<Receipt | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [data, setData] = useState<PageResult | null>(null),
    [loadError, setLoadError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [reverse, setReverse] = useState<RecordItem | null>(null);
  const lock = useRef(false),
    page = Math.max(1, Number(params.get('page')) || 1),
    allowed = !!user?.permissions.includes('transactions.view');
  const canPost = !!user?.permissions.includes('transactions.process'),
    canReverse = !!user?.permissions.includes('transactions.reverse');
  useEffect(() => {
    if (pending) sessionStorage.setItem(storage, JSON.stringify(pending));
    else sessionStorage.removeItem(storage);
  }, [storage, pending]);
  useEffect(() => {
    if (!allowed) return;
    const c = new AbortController();
    setLoading(true);
    setLoadError('');
    const q = new URLSearchParams(params);
    q.set('page', String(page));
    q.set('pageSize', '10');
    void api<PageResult>('/transactions?' + q, { signal: c.signal })
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setLoadError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [allowed, params, page, revision]);
  function review() {
    setError('');
    setReceipt(null);
    try {
      const body = reverse
        ? reversalSchema.parse({
            branch_id: branch,
            reason: description,
            idempotency_key: crypto.randomUUID(),
          })
        : (operation === 'transfer' ? transferSchema : postingSchema).parse({
            account_id: account,
            branch_id: branch,
            amount,
            description,
            idempotency_key: crypto.randomUUID(),
            ...(operation === 'transfer' ? { destination_account_id: destination } : {}),
          });
      setPending({
        path: reverse ? '/transactions/' + reverse.id + '/reverse' : '/transactions/' + operation,
        body,
        label: reverse ? 'Reverse ' + reverse.reference_number : operation,
        attempted: false,
        labels,
      });
    } catch (e) {
      setError(
        e instanceof Error && 'issues' in e
          ? 'Check the selected accounts, amount and description. Amounts must be positive with at most two decimal places.'
          : String(e),
      );
    }
  }
  async function post() {
    if (!pending || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const attempt = { ...pending, attempted: true };
    setPending(attempt);
    sessionStorage.setItem(storage, JSON.stringify(attempt));
    try {
      const result = await api<Receipt>(pending.path, {
        method: 'POST',
        body: JSON.stringify(pending.body),
      });
      setReceipt(result);
      setPending(null);
      setReverse(null);
      setAmount('');
      setDescription('');
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to post.');
      if (!pending.attempted && e instanceof RequestError && e.status >= 400 && e.status < 500)
        setPending({ ...attempt, attempted: false });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!allowed)
    return (
      <section className="notice">
        <h1>Access restricted</h1>
        <p>Your role cannot view banking transactions.</p>
      </section>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">BANKING OPERATIONS</p>
          <h1>Transactions</h1>
          <p>Move funds with a clear record of every change.</p>
        </div>
      </div>
      <p className="notice">
        Academic ledger in INR. Imported accounts remain frozen until their opening balances are
        reviewed.
      </p>
      <ErrorNotice message={error} />
      {receipt && (
        <section className="notice success" role="status">
          <strong>{receipt.replayed ? 'Previous posting confirmed' : 'Posting completed'}</strong>
          <p>
            Reference: <span className="receipt-reference">{receipt.reference_number}</span>
          </p>
        </section>
      )}
      {(canPost || reverse) && !pending && (
        <section className="records-panel record-form-panel">
          <h2>{reverse ? 'Reverse transaction' : 'New transaction'}</h2>
          {reverse && (
            <p>
              Reverse reference {String(reverse.reference_number)} for ₹{String(reverse.amount)}. A
              transfer reversal reverses both sides together.
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              review();
            }}
          >
            <div className="record-form-grid">
              {!reverse && (
                <>
                  <div className="field">
                    <label htmlFor="operation">Operation</label>
                    <select
                      id="operation"
                      value={operation}
                      onChange={(e) => setOperation(e.target.value)}
                    >
                      <option value="deposit">Deposit</option>
                      <option value="withdrawal">Withdrawal</option>
                      <option value="transfer">Transfer</option>
                    </select>
                  </div>
                  <LookupSelect
                    label="Account"
                    path="/lookups/posting/accounts"
                    value={account}
                    onChange={(id, label) => {
                      setAccount(id);
                      setLabels((v) => ({ ...v, account_id: label || id }));
                    }}
                  />
                  {operation === 'transfer' && (
                    <LookupSelect
                      label="Destination account"
                      path="/lookups/posting/accounts"
                      value={destination}
                      onChange={(id, label) => {
                        setDestination(id);
                        setLabels((v) => ({ ...v, destination_account_id: label || id }));
                      }}
                    />
                  )}
                  <div className="field">
                    <label htmlFor="amount">Amount · INR</label>
                    <input
                      id="amount"
                      inputMode="decimal"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </>
              )}
              <LookupSelect
                label="Branch"
                path="/lookups/posting/branches"
                value={branch}
                onChange={(id, label) => {
                  setBranch(id);
                  setLabels((v) => ({ ...v, branch_id: label || id }));
                }}
              />
              <div className="field field-wide">
                <label htmlFor="description">{reverse ? 'Reversal reason' : 'Description'}</label>
                <textarea
                  id="description"
                  required
                  minLength={3}
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            <div className="form-actions">
              <button className="button">Review transaction</button>
              {reverse && (
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setReverse(null)}
                >
                  Cancel reversal
                </button>
              )}
            </div>
          </form>
        </section>
      )}
      {pending && (
        <section className="records-panel record-form-panel" aria-label="Review transaction">
          <h2>Confirm {pending.label}</h2>
          <dl className="review-details">
            {Object.entries(pending.body)
              .filter(([k]) => k !== 'idempotency_key')
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k.replace('_id', '').replaceAll('_', ' ')}</dt>
                  <dd>{pending.labels?.[k] || v}</dd>
                </div>
              ))}
          </dl>
          <p>
            {pending.attempted
              ? 'The result has not been confirmed. Retry this same request safely; the request key prevents duplicate posting.'
              : 'Check the accounts and amount before posting. Posted history is preserved.'}
          </p>
          <div className="form-actions">
            <button className="button" disabled={busy} onClick={() => void post()}>
              {busy ? 'Posting…' : pending.attempted ? 'Retry same request' : 'Confirm posting'}
            </button>
            {!pending.attempted && (
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() => {
                  setPending(null);
                  setError('');
                }}
              >
                Back to editing
              </button>
            )}
          </div>
        </section>
      )}
      <section className="records-panel related-records">
        <h2>Transaction history</h2>
        <form
          className="records-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setParams(
              Object.fromEntries(
                [...f.entries()].filter(([, v]) => v).map(([k, v]) => [k, String(v)]),
              ),
            );
          }}
        >
          <label>
            Reference or account
            <input name="search" defaultValue={params.get('search') || ''} maxLength={80} />
          </label>
          <label>
            From
            <input name="date_from" type="date" defaultValue={params.get('date_from') || ''} />
          </label>
          <label>
            To
            <input name="date_to" type="date" defaultValue={params.get('date_to') || ''} />
          </label>
          <button className="button button-outline">Filter</button>
          <button
            type="button"
            className="button button-outline"
            onClick={() => setRevision((v) => v + 1)}
          >
            Refresh
          </button>
        </form>
        <ErrorNotice message={loadError} />
        {loading ? (
          <p role="status" className="records-empty">
            Loading history…
          </p>
        ) : (
          !loadError && (
            <>
              <div className="table-scroll">
                <table className="records-table">
                  <thead>
                    <tr>
                      {[
                        'Reference / date (UTC)',
                        'Account',
                        'Type',
                        'Amount · INR',
                        'Balance after',
                        'Action',
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data?.items.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <span className="receipt-reference">{String(r.reference_number)}</span>
                          <small className="table-detail">{String(r.transaction_date)}</small>
                        </td>
                        <td>{String(r.account_number)}</td>
                        <td>{String(r.transaction_type).replaceAll('_', ' ')}</td>
                        <td className="money">₹{String(r.amount)}</td>
                        <td className="money">₹{String(r.balance_after)}</td>
                        <td>
                          {r.reversed_by_reference
                            ? 'Reversed'
                            : canReverse &&
                              !String(r.transaction_type).startsWith('reversal') && (
                                <button
                                  className="button button-outline"
                                  disabled={!!pending}
                                  onClick={() => {
                                    setReverse(r);
                                    setDescription('');
                                    setError('');
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                >
                                  Reverse
                                </button>
                              )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data?.items.length && <p className="records-empty">No transactions found.</p>}
              <Pager
                page={page}
                total={data?.total || 0}
                onChange={(p) => setParams({ ...Object.fromEntries(params), page: String(p) })}
              />
            </>
          )
        )}
      </section>
    </>
  );
}
