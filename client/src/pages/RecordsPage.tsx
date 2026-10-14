/* eslint-disable react-hooks/set-state-in-effect -- Route/filter fetches reset their loading and error feedback before the next response. */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, ArrowUpRight, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { Module, PageResult, RecordItem } from '@ledgerline/shared';
import { api } from '../services/api';
import { useAuth } from '../auth/context';
import { moduleTitles } from './recordsConfig';
export function RecordStatus({ value }: { value: string }) {
  return <span className={'record-status status-' + value}>{value.replaceAll('_', ' ')}</span>;
}
function cell(row: RecordItem, key: string) {
  const v = row[key];
  return v === null || v === undefined ? '—' : String(v);
}
export default function RecordsPage({ module }: { module: Module }) {
  const { user } = useAuth(),
    [params, setParams] = useSearchParams(),
    [data, setData] = useState<PageResult | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const allowed = user?.permissions.includes(module + '.view'),
    create = user?.permissions.includes(module + '.create');
  const page = Math.max(1, Number(params.get('page')) || 1),
    search = params.get('search') || '',
    status = params.get('status') || '';
  useEffect(() => {
    if (!allowed) return;
    const c = new AbortController();
    setLoading(true);
    setError('');
    api<PageResult>(
      '/' +
        module +
        '?' +
        new URLSearchParams({ page: String(page), pageSize: '10', search, status }),
      { signal: c.signal },
    )
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [module, page, search, status, revision, allowed]);
  if (!allowed)
    return (
      <section className="notice">
        <h1>Access restricted</h1>
        <p>Your role does not include access to {moduleTitles[module].toLowerCase()}.</p>
      </section>
    );
  const columns =
    module === 'employees'
      ? [
          ['name', 'Employee'],
          ['employee_code', 'Code'],
          ['department', 'Department'],
          ['designation', 'Designation'],
          ['employment_status', 'Status'],
        ]
      : module === 'customers'
        ? [
            ['name', 'Customer'],
            ['email', 'Email'],
            ['phone', 'Phone'],
            ['account_count', 'Accounts'],
            ['customer_status', 'Status'],
          ]
        : module === 'accounts'
          ? [
              ['account_number', 'Account'],
              ['customer_name', 'Customer'],
              ['account_type', 'Type'],
              ['balance', 'Balance · INR'],
              ['account_status', 'Status'],
            ]
          : [
              ['name', 'Branch'],
              ['branch_code', 'Code'],
              ['phone', 'Phone'],
              ['branch_status', 'Status'],
            ];
  const statuses =
    module === 'employees'
      ? ['active', 'on_leave', 'inactive', 'legacy_incomplete']
      : module === 'accounts'
        ? ['active', 'frozen', 'closed']
        : ['active', 'inactive'];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">RECORD MANAGEMENT</p>
          <h1>{moduleTitles[module]}</h1>
          <p>
            {module === 'employees'
              ? 'Keep employment details current and prepare accurate payroll.'
              : module === 'accounts'
                ? 'Ownership, balances and account status in one place.'
                : module === 'customers'
                  ? 'A clear view of the people behind your accounts.'
                  : 'Maintain the places your customers connect with you.'}
          </p>
        </div>
        {create && (
          <Link className="button" to={'/app/' + module + '/new'}>
            <Plus size={17} />
            Add{' '}
            {module === 'employees'
              ? 'employee'
              : module === 'accounts'
                ? 'account'
                : module.slice(0, -1) === 'branche'
                  ? 'branch'
                  : 'customer'}
          </Link>
        )}
      </div>
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
          <div className="search-control">
            <Search size={18} />
            <label className="sr-only" htmlFor="record-search">
              Search {moduleTitles[module]}
            </label>
            <input
              key={module + search}
              id="record-search"
              name="search"
              defaultValue={search}
              placeholder={'Search ' + moduleTitles[module].toLowerCase()}
              maxLength={80}
            />
          </div>
          <label className="sr-only" htmlFor="record-status">
            Filter by status
          </label>
          <select key={module + status} id="record-status" name="status" defaultValue={status}>
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button className="button button-outline" type="submit">
            Apply filters
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Refresh records"
            onClick={() => setRevision((v) => v + 1)}
          >
            <RefreshCw size={18} />
          </button>
        </form>
        {loading ? (
          <div className="records-empty" role="status">
            Loading {moduleTitles[module].toLowerCase()}…
          </div>
        ) : error ? (
          <div className="records-empty">
            <p role="alert" className="field-error">
              {error}
            </p>
            <button className="button button-outline" onClick={() => setRevision((v) => v + 1)}>
              Try again
            </button>
          </div>
        ) : !data?.items.length ? (
          <div className="records-empty">
            <h2>No {moduleTitles[module].toLowerCase()} found</h2>
            <p>
              {search || status
                ? 'Try a different search or clear the filters.'
                : 'New records will appear here.'}
            </p>
            {(search || status || page > 1) && (
              <button className="button button-outline" onClick={() => setParams({})}>
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label={moduleTitles[module] + ' table'}
            >
              <table className="records-table">
                <thead>
                  <tr>
                    {columns.map(([key, title]) => (
                      <th scope="col" key={key}>
                        {title}
                      </th>
                    ))}
                    <th scope="col">
                      <span className="sr-only">Open record</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id}>
                      {columns.map(([key], i) => (
                        <td key={key}>
                          {i === 0 ? (
                            <Link className="record-link" to={'/app/' + module + '/' + row.id}>
                              {cell(row, key)}
                            </Link>
                          ) : key.endsWith('_status') ? (
                            <RecordStatus value={cell(row, key)} />
                          ) : key === 'balance' ? (
                            <span className="money">₹{cell(row, key)}</span>
                          ) : (
                            cell(row, key)
                          )}
                        </td>
                      ))}
                      <td>
                        <Link
                          className="icon-button"
                          to={'/app/' + module + '/' + row.id}
                          aria-label={'Open ' + cell(row, columns[0][0])}
                        >
                          <ArrowUpRight size={17} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="records-pagination">
              <span>
                {(page - 1) * 10 + 1}–{Math.min(page * 10, data.total)} of {data.total} records
              </span>
              <div>
                <button
                  className="icon-button"
                  disabled={page <= 1}
                  aria-label="Previous page"
                  onClick={() =>
                    setParams({ ...Object.fromEntries(params), page: String(page - 1) })
                  }
                >
                  <ChevronLeft size={18} />
                </button>
                <span>Page {page}</span>
                <button
                  className="icon-button"
                  disabled={page * 10 >= data.total}
                  aria-label="Next page"
                  onClick={() =>
                    setParams({ ...Object.fromEntries(params), page: String(page + 1) })
                  }
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      {module === 'accounts' && (
        <p className="records-footnote">
          Amounts are stored as exact decimals. Imported accounts remain frozen pending
          opening-balance review.
        </p>
      )}
    </>
  );
}
