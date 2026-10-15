/* eslint-disable react-hooks/set-state-in-effect -- Record and report requests track route/filter state. */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  payrollSchema,
  payrollUpdateSchema,
  payrollAmountsSchema,
  cents,
  decimal,
  type PageResult,
  type RecordItem,
} from '@ledgerline/shared';
import { api, RequestError } from '../services/api';
import { useAuth } from '../auth/context';
import { LookupSelect, Pager, ErrorNotice } from '../components/finance/Controls';
import { RecordStatus } from './RecordsPage';
type Values = {
  employee_id: string;
  payroll_period: string;
  salary_amount: string;
  bonus: string;
  deductions: string;
};
type Review = { path: string; body: object; label: string; attempted: boolean };
const blank = (): Values => ({
  employee_id: '',
  payroll_period: new Date().toISOString().slice(0, 7) + '-01',
  salary_amount: '',
  bonus: '0.00',
  deductions: '0.00',
});
export default function PayrollPage() {
  const { id } = useParams(),
    isNew = id === 'new',
    detail = !!id,
    { user } = useAuth(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams();
  const allowed = !!user?.permissions.includes(isNew ? 'payroll.create' : 'payroll.view'),
    can = (p: string) => !!user?.permissions.includes(p);
  const [data, setData] = useState<PageResult | null>(null),
    [record, setRecord] = useState<RecordItem | null>(null),
    [values, setValues] = useState<Values>(blank),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [notice, setNotice] = useState(''),
    [reason, setReason] = useState(''),
    [audit, setAudit] = useState<{
      items: { id: string; action: string; created_at: string; actor_name: string }[];
      total: number;
    } | null>(null),
    [auditPage, setAuditPage] = useState(1),
    [summary, setSummary] = useState<{
      items: Record<string, string | number>[];
      total: number;
    } | null>(null),
    [summaryPage, setSummaryPage] = useState(1);
  const storage = 'ledgerline:payroll:' + user?.id + ':' + id;
  const [review, setReview] = useState<Review | null>(() => {
      try {
        return JSON.parse(sessionStorage.getItem(storage) || 'null');
      } catch {
        return null;
      }
    }),
    lock = useRef(false);
  const page = Math.max(1, Number(params.get('page')) || 1);
  useEffect(() => {
    if (review?.label === 'process') sessionStorage.setItem(storage, JSON.stringify(review));
    else sessionStorage.removeItem(storage);
  }, [storage, review]);
  useEffect(() => {
    if (!allowed) return;
    const c = new AbortController();
    setLoading(true);
    setError('');
    if (!detail) setData(null);
    async function load() {
      if (isNew) {
        setRecord(null);
        setValues(blank());
        return;
      }
      if (detail) {
        const r = await api<RecordItem>('/payroll/' + id, { signal: c.signal });
        setRecord(r);
        setValues({
          employee_id: String(r.employee_id),
          payroll_period: String(r.payroll_period),
          salary_amount: String(r.salary_amount),
          bonus: String(r.bonus),
          deductions: String(r.deductions),
        });
      } else {
        setData(await api<PageResult>('/payroll?' + params, { signal: c.signal }));
        if (can('reports.payroll.view'))
          setSummary(
            await api<typeof summary>('/payroll/summary?page=' + summaryPage, { signal: c.signal }),
          );
      }
    }
    void load()
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
    // Permission checks depend on the authenticated user snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew, detail, allowed, params, revision, user, summaryPage]);
  useEffect(() => {
    if (!allowed || !detail || isNew) return;
    const c = new AbortController();
    setAudit(null);
    void api<typeof audit>('/payroll/' + id + '/audit?page=' + auditPage, { signal: c.signal })
      .then(setAudit)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [allowed, detail, isNew, id, auditPage, revision]);
  const editable =
    (isNew
      ? can('payroll.create')
      : can('payroll.update') && ['draft', 'rejected'].includes(String(record?.payroll_status))) &&
    !review;
  const parsed = payrollAmountsSchema.safeParse({
    salary_amount: values.salary_amount,
    bonus: values.bonus,
    deductions: values.deductions,
  });
  const gross = parsed.success ? decimal(cents(values.salary_amount) + cents(values.bonus)) : null,
    net = parsed.success
      ? decimal(cents(values.salary_amount) + cents(values.bonus) - cents(values.deductions))
      : null;
  async function save() {
    if (lock.current) return;
    setError('');
    const parsed = (isNew ? payrollSchema : payrollUpdateSchema).safeParse({
      ...values,
      ...(!isNew ? { row_version: Number(record?.row_version) } : {}),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(' '));
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const r = await api<RecordItem>('/payroll' + (isNew ? '' : '/' + id), {
        method: isNew ? 'POST' : 'PATCH',
        body: JSON.stringify(parsed.data),
      });
      if (isNew) navigate('/app/payroll/' + r.id, { replace: true });
      else {
        setRevision((v) => v + 1);
        setNotice('Draft saved. Submit it when ready for independent review.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function prepare(action: string) {
    setError('');
    setNotice('');
    if (action === 'reject' && reason.trim().length < 3) {
      setError('Enter a rejection reason of at least 3 characters.');
      return;
    }
    setReview({
      path: '/payroll/' + id + '/' + action,
      label: action,
      attempted: false,
      body:
        action === 'process'
          ? {
              idempotency_key: crypto.randomUUID(),
              description: 'Process approved academic payroll',
            }
          : {
              row_version: Number(record?.row_version),
              ...(action === 'reject' ? { reason } : {}),
            },
    });
  }
  async function confirm() {
    if (!review || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const attempt = { ...review, attempted: true };
    setReview(attempt);
    if (review.label === 'process') sessionStorage.setItem(storage, JSON.stringify(attempt));
    try {
      const r = await api<RecordItem & { reference_number?: string }>(review.path, {
        method: 'POST',
        body: JSON.stringify(review.body),
      });
      setReview(null);
      setReason('');
      setNotice(
        r.reference_number
          ? 'Payroll processed. Reference: ' + r.reference_number
          : 'Payroll ' + review.label + ' completed.',
      );
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to complete action.');
      if (
        review.label !== 'process' ||
        (!review.attempted && e instanceof RequestError && e.status < 500)
      )
        setReview({ ...attempt, attempted: false });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!allowed)
    return (
      <section className="notice">
        <h1>Access restricted</h1>
        <p>Your role does not allow this payroll action.</p>
      </section>
    );
  return (
    <>
      {detail && (
        <Link className="text-link record-back" to="/app/payroll">
          ← Back to payroll
        </Link>
      )}
      <div className="page-heading">
        <div>
          <p className="eyebrow">PEOPLE & PAYROLL</p>
          <h1>{isNew ? 'Prepare payroll' : detail ? 'Payroll details' : 'Payroll'}</h1>
          <p>Accurate amounts, independent review and a lasting history.</p>
        </div>
        {!detail && can('payroll.create') && (
          <Link className="button" to="/app/payroll/new">
            Prepare payroll
          </Link>
        )}
        {record && <RecordStatus value={String(record.payroll_status)} />}
      </div>
      <p className="notice">
        Processing records an internal payroll completion. It does not send money to a bank or
        external payment provider.
      </p>
      <ErrorNotice message={error} />
      {notice && (
        <p className="notice success" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <p className="records-empty" role="status">
          Loading payroll…
        </p>
      ) : detail ? (
        <>
          {(isNew || record) && (
            <section className="records-panel record-form-panel">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <div className="record-form-grid">
                  {editable ? (
                    <LookupSelect
                      label="Employee"
                      path="/lookups/employees"
                      value={values.employee_id}
                      currentLabel={String(record?.employee_name || '')}
                      onChange={(v) => setValues({ ...values, employee_id: v })}
                    />
                  ) : (
                    <div className="field">
                      <label>Employee</label>
                      <p>
                        {String(record?.employee_name)} · {String(record?.employee_code)}
                      </p>
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor="pay-period">Payroll month</label>
                    <input
                      id="pay-period"
                      type="month"
                      required
                      value={values.payroll_period.slice(0, 7)}
                      disabled={!editable || busy}
                      onChange={(e) =>
                        setValues({ ...values, payroll_period: e.target.value + '-01' })
                      }
                    />
                  </div>
                  {(['salary_amount', 'bonus', 'deductions'] as const).map((k) => (
                    <div className="field" key={k}>
                      <label htmlFor={k}>
                        {k === 'salary_amount'
                          ? 'Base salary'
                          : k === 'bonus'
                            ? 'Bonus'
                            : 'Deductions'}{' '}
                        · INR
                      </label>
                      <input
                        id={k}
                        inputMode="decimal"
                        required
                        value={values[k]}
                        disabled={!editable || busy}
                        onChange={(e) => setValues({ ...values, [k]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
                <div className="payroll-preview" aria-label="Payroll calculation">
                  <div>
                    <span>Gross salary</span>
                    <strong>₹{gross || '—'}</strong>
                  </div>
                  <div>
                    <span>Net salary</span>
                    <strong>₹{net || '—'}</strong>
                  </div>
                </div>
                {!parsed.success && (
                  <p className="field-error">
                    Enter nonnegative amounts with at most two decimal places. Deductions cannot
                    exceed gross salary.
                  </p>
                )}
                {editable && (
                  <div className="form-actions">
                    <button className="button" disabled={busy || !parsed.success}>
                      {busy ? 'Saving…' : 'Save draft'}
                    </button>
                    {can('payroll.create') && (
                      <button
                        type="button"
                        className="button button-outline"
                        disabled={busy || !parsed.success}
                        onClick={() => {
                          setBusy(true);
                          void api<{ gross_salary: string; net_salary: string }>(
                            '/payroll/preview',
                            {
                              method: 'POST',
                              body: JSON.stringify({
                                salary_amount: values.salary_amount,
                                bonus: values.bonus,
                                deductions: values.deductions,
                              }),
                            },
                          )
                            .then((r) =>
                              setNotice(
                                'Verified calculation: gross ₹' +
                                  r.gross_salary +
                                  ', net ₹' +
                                  r.net_salary,
                              ),
                            )
                            .catch((e) => setError(e.message))
                            .finally(() => setBusy(false));
                        }}
                      >
                        Verify calculation
                      </button>
                    )}
                  </div>
                )}
              </form>
              {record?.rejection_reason && (
                <p className="notice">Rejection reason: {String(record.rejection_reason)}</p>
              )}
              {record?.processing_reference && (
                <p>
                  Processing reference:{' '}
                  <span className="receipt-reference">{String(record.processing_reference)}</span>
                </p>
              )}
              {!review && record && (
                <div className="workflow-actions">
                  {record.payroll_status === 'draft' && can('payroll.update') && (
                    <>
                      <p>Save any edits before submitting. Submission uses the saved draft.</p>
                      <button className="button" disabled={busy} onClick={() => prepare('submit')}>
                        Submit for approval
                      </button>
                    </>
                  )}
                  {record.payroll_status === 'pending_approval' &&
                    can('payroll.approve') &&
                    (String(record.created_by) === user?.id ? (
                      <p className="notice">
                        Another authorized person must approve or reject payroll you prepared.
                      </p>
                    ) : (
                      <>
                        <label className="field">
                          Rejection reason
                          <textarea
                            maxLength={500}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </label>
                        <div className="form-actions">
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() => prepare('approve')}
                          >
                            Approve
                          </button>
                          <button
                            className="button button-outline"
                            disabled={busy}
                            onClick={() => prepare('reject')}
                          >
                            Reject
                          </button>
                        </div>
                      </>
                    ))}
                  {record.payroll_status === 'approved' && can('payroll.process') && (
                    <button className="button" disabled={busy} onClick={() => prepare('process')}>
                      Process payroll
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
          {review && (
            <section className="records-panel record-form-panel">
              <h2>Confirm {review.label}</h2>
              <p>
                {String(record?.employee_name)} · {String(record?.payroll_period).slice(0, 7)} · Net
                ₹{String(record?.net_salary)}
              </p>
              {review.attempted && (
                <p>
                  The result is not confirmed. Retrying uses the same request key to prevent
                  duplicate processing.
                </p>
              )}
              <div className="form-actions">
                <button className="button" disabled={busy} onClick={() => void confirm()}>
                  {busy
                    ? 'Working…'
                    : review.attempted
                      ? 'Retry same request'
                      : 'Confirm ' + review.label}
                </button>
                {!review.attempted && (
                  <button
                    className="button button-outline"
                    disabled={busy}
                    onClick={() => setReview(null)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </section>
          )}
          {audit && (
            <section className="records-panel related-records">
              <h2>Payroll audit history</h2>
              {audit.items.length ? (
                <ul className="audit-timeline">
                  {audit.items.map((a) => (
                    <li key={a.id}>
                      <strong>{a.action.replace('payroll.', '')}</strong>
                      <span>
                        {a.actor_name} · {a.created_at} UTC
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No audit entries yet.</p>
              )}
              <Pager page={auditPage} total={audit.total} onChange={setAuditPage} />
            </section>
          )}
        </>
      ) : (
        <>
          <section className="records-panel">
            <form
              className="records-toolbar"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setParams({
                  search: String(f.get('search') || ''),
                  status: String(f.get('status') || ''),
                  page: '1',
                });
              }}
            >
              <label>
                Employee
                <input
                  name="search"
                  defaultValue={params.get('search') || ''}
                  placeholder="Name or code"
                  maxLength={80}
                />
              </label>
              <label>
                Status
                <select name="status" defaultValue={params.get('status') || ''}>
                  <option value="">All statuses</option>
                  {['draft', 'pending_approval', 'approved', 'rejected', 'processed', 'failed'].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
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
            <div className="table-scroll">
              <table className="records-table">
                <thead>
                  <tr>
                    {['Employee', 'Month', 'Gross · INR', 'Deductions', 'Net · INR', 'Status'].map(
                      (h) => (
                        <th key={h}>{h}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link className="record-link" to={'/app/payroll/' + r.id}>
                          {String(r.employee_name)}
                        </Link>
                        <small className="table-detail">{String(r.employee_code)}</small>
                      </td>
                      <td>{String(r.payroll_period).slice(0, 7)}</td>
                      <td>₹{String(r.gross_salary)}</td>
                      <td>₹{String(r.deductions)}</td>
                      <td className="money">₹{String(r.net_salary)}</td>
                      <td>
                        <RecordStatus value={String(r.payroll_status)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data && !data.items.length && (
              <p className="records-empty">No payroll records found.</p>
            )}
            <Pager
              page={page}
              total={data?.total || 0}
              onChange={(p) => setParams({ ...Object.fromEntries(params), page: String(p) })}
            />
          </section>
          {summary && (
            <section className="records-panel related-records">
              <h2>Monthly payroll summary</h2>
              <div className="table-scroll">
                <table className="records-table">
                  <thead>
                    <tr>
                      {['Month', 'Status', 'Employees', 'Gross · INR', 'Net · INR'].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.items.map((r) => (
                      <tr key={String(r.payroll_period) + r.payroll_status}>
                        <td>{String(r.payroll_period).slice(0, 7)}</td>
                        <td>
                          <RecordStatus value={String(r.payroll_status)} />
                        </td>
                        <td>{r.employee_count}</td>
                        <td>₹{r.gross_total}</td>
                        <td>₹{r.net_total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!summary.items.length && <p className="records-empty">No payroll summary yet.</p>}
              <Pager page={summaryPage} total={summary.total} onChange={setSummaryPage} />
            </section>
          )}
        </>
      )}
      {error && (
        <button className="button button-outline" onClick={() => setRevision((v) => v + 1)}>
          Reload saved records
        </button>
      )}
    </>
  );
}
