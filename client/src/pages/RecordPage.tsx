/* eslint-disable react-hooks/set-state-in-effect -- A route change resets remote record/form state before loading its replacement. */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Save, LockKeyhole } from 'lucide-react';
import {
  customerSchema,
  customerUpdateSchema,
  branchSchema,
  branchUpdateSchema,
  employeeSchema,
  employeeUpdateSchema,
  accountSchema,
  accountUpdateSchema,
  type Module,
  type RecordItem,
  type Lookup,
  type PageResult,
} from '@ledgerline/shared';
import { api, RequestError } from '../services/api';
import OpeningBalanceReview from '../components/finance/OpeningBalanceReview';
import { useAuth } from '../auth/context';
import { RecordStatus } from './RecordsPage';
import { moduleTitles } from './recordsConfig';
type Values = Record<string, string | number>;
type Field = { key: string; label: string; type?: string; options?: string[]; max?: number };
export default function RecordPage({ module }: { module: Module }) {
  const { id } = useParams(),
    isNew = !id,
    navigate = useNavigate(),
    { user } = useAuth();
  const canEdit = !!user?.permissions.includes(module + (isNew ? '.create' : '.update'));
  const canView = isNew ? canEdit : !!user?.permissions.includes(module + '.view');
  const schema =
    module === 'employees'
      ? isNew
        ? employeeSchema
        : employeeUpdateSchema
      : module === 'customers'
        ? isNew
          ? customerSchema
          : customerUpdateSchema
        : module === 'branches'
          ? isNew
            ? branchSchema
            : branchUpdateSchema
          : isNew
            ? accountSchema
            : accountUpdateSchema;
  const {
    register,
    handleSubmit,
    reset,
    setError: fieldError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) as unknown as Resolver<Values> });
  const [record, setRecord] = useState<RecordItem | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(''),
    [revision, setRevision] = useState(0),
    [pending, setPending] = useState<Values | null>(null),
    [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Lookup[]>([]),
    [employees, setEmployees] = useState<Lookup[]>([]),
    [customerSearch, setCustomerSearch] = useState(''),
    [employeeSearch, setEmployeeSearch] = useState(''),
    [lookupError, setLookupError] = useState(''),
    [related, setRelated] = useState<PageResult | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const fields: Field[] =
    module === 'employees'
      ? [
          { key: 'employee_code', label: 'Employee code', max: 24 },
          { key: 'name', label: 'Full name', max: 120 },
          { key: 'email', label: 'Email address', type: 'email', max: 254 },
          { key: 'phone', label: 'Phone number', type: 'tel', max: 25 },
          { key: 'department', label: 'Department', max: 100 },
          { key: 'designation', label: 'Designation', max: 100 },
          { key: 'date_of_joining', label: 'Joining date', type: 'date' },
          {
            key: 'employment_status',
            label: 'Status',
            options: ['active', 'on_leave', 'inactive'],
          },
        ]
      : module === 'customers'
        ? [
            { key: 'name', label: 'Full name', max: 120 },
            { key: 'email', label: 'Email address', type: 'email', max: 254 },
            { key: 'phone', label: 'Phone number', type: 'tel', max: 25 },
            { key: 'address', label: 'Address', max: 500 },
            { key: 'customer_status', label: 'Status', options: ['active', 'inactive'] },
          ]
        : module === 'branches'
          ? [
              { key: 'name', label: 'Branch name', max: 120 },
              { key: 'branch_code', label: 'Branch code', max: 20 },
              { key: 'phone', label: 'Phone number', type: 'tel', max: 25 },
              { key: 'address', label: 'Address', max: 500 },
              { key: 'branch_status', label: 'Status', options: ['active', 'inactive'] },
            ]
          : isNew
            ? [
                {
                  key: 'account_type',
                  label: 'Account type',
                  options: ['savings', 'current', 'salary'],
                },
                { key: 'open_date', label: 'Opening date', type: 'date' },
              ]
            : [{ key: 'account_status', label: 'Status', options: ['active', 'frozen', 'closed'] }];
  useEffect(() => {
    if (!canView) return;
    const c = new AbortController();
    setError('');
    setSaved('');
    setLoading(true);
    setRelated(null);
    const run = async () => {
      if (isNew) {
        reset(
          module === 'employees'
            ? {
                employee_code: '',
                name: '',
                email: '',
                phone: '',
                department: '',
                designation: '',
                date_of_joining: new Date().toISOString().slice(0, 10),
                employment_status: 'active',
              }
            : module === 'accounts'
              ? {
                  customer_id: '',
                  employee_id: '',
                  account_type: 'savings',
                  open_date: new Date().toISOString().slice(0, 10),
                }
              : module === 'customers'
                ? { name: '', email: '', phone: '', address: '', customer_status: 'active' }
                : { name: '', branch_code: '', phone: '', address: '', branch_status: 'active' },
        );
        setRecord(null);
        return;
      }
      const r = await api<RecordItem>('/' + module + '/' + id, { signal: c.signal });
      setRecord(r);
      const keys =
        module === 'employees'
          ? [
              'employee_code',
              'name',
              'email',
              'phone',
              'department',
              'designation',
              'date_of_joining',
              'employment_status',
              'row_version',
            ]
          : module === 'accounts'
            ? ['employee_id', 'account_status', 'row_version']
            : module === 'customers'
              ? ['name', 'email', 'phone', 'address', 'customer_status', 'row_version']
              : ['name', 'branch_code', 'phone', 'address', 'branch_status', 'row_version'];
      reset(
        Object.fromEntries(
          keys.map((k) => [
            k,
            k === 'row_version'
              ? Number(r[k])
              : k === 'employment_status' && r[k] === 'legacy_incomplete'
                ? 'active'
                : String(r[k] ?? ''),
          ]),
        ),
      );
      if (module === 'customers' && user?.permissions.includes('accounts.view'))
        setRelated(await api<PageResult>('/customers/' + id + '/accounts', { signal: c.signal }));
    };
    void run()
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [module, id, isNew, revision, reset, canView, user]);
  useEffect(() => {
    if (module !== 'accounts' || !canEdit) return;
    const c = new AbortController();
    const timer = setTimeout(() => {
      const requests = [
        api<{ items: Lookup[] }>(
          '/lookups/employees?search=' + encodeURIComponent(employeeSearch),
          { signal: c.signal },
        ).then((r) => setEmployees(r.items)),
        ...(isNew
          ? [
              api<{ items: Lookup[] }>(
                '/lookups/customers?search=' + encodeURIComponent(customerSearch),
                { signal: c.signal },
              ).then((r) => setCustomers(r.items)),
            ]
          : []),
      ];
      void Promise.all(requests)
        .then(() => setLookupError(''))
        .catch((e) => {
          if (!c.signal.aborted) setLookupError(e.message);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [module, isNew, canEdit, customerSearch, employeeSearch]);
  useEffect(() => {
    if (pending) dialog.current?.showModal();
    else dialog.current?.close();
  }, [pending]);
  async function save(values: Values) {
    if (saving) return;
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const r = await api<RecordItem>('/' + module + (isNew ? '' : '/' + id), {
        method: isNew ? 'POST' : 'PATCH',
        body: JSON.stringify(values),
      });
      setPending(null);
      if (isNew)
        navigate('/app/' + module + '/' + r.id, { replace: true, state: { created: true } });
      else {
        setRecord(r);
        reset({ ...values, row_version: r.row_version });
        setSaved('Changes saved.');
      }
    } catch (e) {
      setPending(null);
      setError(e instanceof Error ? e.message : 'Unable to save this record.');
      if (e instanceof RequestError && e.fields)
        for (const [key, message] of Object.entries(e.fields)) fieldError(key, { message });
    } finally {
      setSaving(false);
    }
  }
  if (!canView)
    return (
      <section className="notice">
        <h1>Access restricted</h1>
        <p>Your role does not allow this action.</p>
      </section>
    );
  if (loading)
    return (
      <div className="records-empty" role="status">
        Opening record…
      </div>
    );
  const disabled = !canEdit || record?.account_status === 'closed';
  const singular =
    module === 'employees'
      ? 'employee'
      : module === 'customers'
        ? 'customer'
        : module === 'branches'
          ? 'branch'
          : 'account';
  function selectLookup(kind: 'customer' | 'employee', options: Lookup[]) {
    const key = kind + '_id',
      current = record?.[key],
      label = kind === 'customer' ? 'Customer' : 'Account officer';
    return (
      <div className="field lookup-field">
        <label htmlFor={kind + '-search'}>Find {label.toLowerCase()}</label>
        <input
          id={kind + '-search'}
          value={kind === 'customer' ? customerSearch : employeeSearch}
          onChange={(e) =>
            kind === 'customer'
              ? setCustomerSearch(e.target.value)
              : setEmployeeSearch(e.target.value)
          }
          placeholder="Search by name"
          disabled={disabled}
        />
        <label htmlFor={key}>{label}</label>
        <select id={key} {...register(key)} disabled={disabled} aria-invalid={!!errors[key]}>
          <option value="">Choose {label.toLowerCase()}</option>
          {current && !options.some((o) => o.id === String(current)) && (
            <option value={String(current)}>
              {String(record?.[kind + '_name'] ?? 'Current officer')}
            </option>
          )}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} — {o.detail}
            </option>
          ))}
        </select>
        {errors[key] && <span className="field-error">{String(errors[key]?.message)}</span>}
      </div>
    );
  }
  return (
    <>
      <Link className="text-link record-back" to={'/app/' + module}>
        <ArrowLeft size={16} />
        Back to {moduleTitles[module].toLowerCase()}
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{isNew ? 'NEW RECORD' : 'RECORD DETAILS'}</p>
          <h1>
            {isNew
              ? 'Add ' + singular
              : String(record?.name || record?.account_number || 'Record unavailable')}
          </h1>
          <p>
            {isNew
              ? 'Enter the details below to create a new record.'
              : 'View the record and save permitted changes.'}
          </p>
        </div>
        {record && (
          <RecordStatus
            value={String(
              record[
                module === 'employees'
                  ? 'employment_status'
                  : module === 'accounts'
                    ? 'account_status'
                    : module === 'customers'
                      ? 'customer_status'
                      : 'branch_status'
              ],
            )}
          />
        )}
      </div>
      {module === 'accounts' && record?.reconciliation_state && id && (
        <OpeningBalanceReview
          key={`${id}:${record.row_version}`}
          accountId={id}
          onReviewed={() => setRevision((v) => v + 1)}
        />
      )}
      {error && (
        <div className="notice error" role="alert">
          <p>{error}</p>
          {!isNew && (
            <button className="button button-outline" onClick={() => setRevision((v) => v + 1)}>
              Reload record
            </button>
          )}
        </div>
      )}
      {saved && (
        <p className="notice success" role="status">
          {saved}
        </p>
      )}
      {(isNew || record) && (
        <div className="record-detail-grid">
          <section className="records-panel record-form-panel">
            {record?.employment_status === 'legacy_incomplete' && (
              <p className="notice">
                Confirm the missing designation and joining date before activating this imported
                employee.
              </p>
            )}
            <form
              onSubmit={handleSubmit(async (values) => {
                const statusKey =
                  module === 'employees'
                    ? 'employment_status'
                    : module === 'customers'
                      ? 'customer_status'
                      : module === 'branches'
                        ? 'branch_status'
                        : 'account_status';
                if (record && record[statusKey] !== values[statusKey]) setPending(values);
                else await save(values);
              })}
              noValidate
            >
              <div className="record-form-grid">
                {module === 'accounts' && isNew && selectLookup('customer', customers)}
                {module === 'accounts' && canEdit && selectLookup('employee', employees)}
                {fields.map((f) => (
                  <div className={'field ' + (f.key === 'address' ? 'field-wide' : '')} key={f.key}>
                    <label htmlFor={'record-' + f.key}>{f.label}</label>
                    {f.options ? (
                      <select
                        id={'record-' + f.key}
                        {...register(f.key)}
                        disabled={disabled}
                        aria-invalid={!!errors[f.key]}
                      >
                        {f.options.map((o) => (
                          <option
                            key={o}
                            disabled={
                              f.key === 'account_status' &&
                              record?.reconciliation_state === 'pending' &&
                              o !== 'frozen'
                            }
                          >
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : f.key === 'address' ? (
                      <textarea
                        id={'record-' + f.key}
                        rows={3}
                        maxLength={f.max}
                        {...register(f.key)}
                        disabled={disabled}
                        aria-invalid={!!errors[f.key]}
                      />
                    ) : (
                      <input
                        id={'record-' + f.key}
                        type={f.type || 'text'}
                        maxLength={f.max}
                        max={f.type === 'date' ? new Date().toISOString().slice(0, 10) : undefined}
                        {...register(f.key)}
                        disabled={disabled}
                        aria-invalid={!!errors[f.key]}
                      />
                    )}{' '}
                    {errors[f.key] && (
                      <span className="field-error">{String(errors[f.key]?.message)}</span>
                    )}
                  </div>
                ))}
              </div>
              {!isNew && (
                <input type="hidden" {...register('row_version', { valueAsNumber: true })} />
              )}{' '}
              {lookupError && (
                <p className="notice error" role="alert">
                  {lookupError} Try changing the lookup search to retry.
                </p>
              )}
              {!disabled && (
                <div className="form-actions">
                  <button
                    className="button"
                    disabled={saving || isSubmitting || !!pending || !!lookupError}
                  >
                    <Save size={17} />
                    {isSubmitting ? 'Saving…' : isNew ? 'Create ' + singular : 'Save changes'}
                  </button>
                  <Link className="button button-outline" to={'/app/' + module}>
                    Cancel
                  </Link>
                </div>
              )}
              {disabled && (
                <p className="records-footnote">
                  <LockKeyhole size={15} />{' '}
                  {canEdit
                    ? 'Closed accounts are retained unchanged for history.'
                    : 'Your role has read-only access to this record.'}
                </p>
              )}
            </form>
          </section>
          <aside className="record-help">
            <h2>
              {module === 'accounts' ? 'Account safeguards' : 'Good records, lasting history'}
            </h2>
            {module === 'accounts' ? (
              <>
                {record && (
                  <dl>
                    <dt>Current balance</dt>
                    <dd className="detail-balance">
                      ₹{String(record.balance)} <small>INR</small>
                    </dd>
                    <dt>Customer</dt>
                    <dd>{String(record.customer_name)}</dd>
                    <dt>Account officer</dt>
                    <dd>{String(record.employee_name)}</dd>
                    <dt>Opened</dt>
                    <dd>{String(record.open_date)}</dd>
                    <dt>Type</dt>
                    <dd>{String(record.account_type)}</dd>
                  </dl>
                )}
                <p>New accounts start at ₹0.00. Balances cannot be edited here.</p>
                {record?.reconciliation_state === 'pending' && (
                  <div className="notice">
                    <strong>Opening balance review required</strong>
                    <p>
                      This imported account must remain frozen until its recorded opening balance is
                      reviewed.
                    </p>
                  </div>
                )}
                <p>
                  Account officers marked “legacy_incomplete” are existing imported employees whose
                  employment details still need confirmation.
                </p>
                <p>Only zero-balance accounts can close. Closed accounts cannot reopen.</p>
              </>
            ) : (
              <>
                <p>
                  Keep contact details current. Records are retained rather than deleted, so linked
                  history remains available.
                </p>
                {module === 'customers' && (
                  <p>Close all linked accounts before making a customer inactive.</p>
                )}
              </>
            )}
          </aside>
        </div>
      )}
      {related && (
        <section className="records-panel related-records">
          <h2>Linked accounts</h2>
          {related.items.length ? (
            <ul>
              {related.items.map((a) => (
                <li key={a.id}>
                  <Link className="record-link" to={'/app/accounts/' + a.id}>
                    {String(a.account_number)}
                  </Link>
                  <RecordStatus value={String(a.account_status)} />
                  <span>₹{String(a.balance)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No accounts are linked to this customer.</p>
          )}
          {related.total > related.items.length && (
            <p>
              Showing the first {related.items.length} of {related.total}.{' '}
              <Link to={'/app/accounts?search=' + encodeURIComponent(String(record?.name || ''))}>
                Search all accounts
              </Link>
            </p>
          )}
        </section>
      )}
      <dialog
        ref={dialog}
        className="confirm-dialog"
        onCancel={(event) => {
          if (saving) event.preventDefault();
          else setPending(null);
        }}
        aria-labelledby="confirm-title"
      >
        <h2 id="confirm-title">Confirm status change</h2>
        <p>
          This changes the availability of the {singular}. Its record and history will be retained.
        </p>
        <div className="form-actions">
          <button
            className="button"
            disabled={saving || isSubmitting}
            onClick={() => {
              if (pending) void save(pending);
            }}
          >
            Confirm change
          </button>
          <button
            className="button button-outline"
            disabled={saving}
            onClick={() => setPending(null)}
          >
            Keep current status
          </button>
        </div>
      </dialog>
    </>
  );
}
