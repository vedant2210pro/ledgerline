import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ReportKind, ReportResult } from '@ledgerline/shared';
import { useAuth } from '../auth/context';
import { useRemote } from '../hooks/useRemote';
import { DateFilters } from '../components/finance/DateFilters';
import { Pager, ErrorNotice } from '../components/finance/Controls';
const choices: { kind: ReportKind; label: string; permission: string; statuses: string[] }[] = [
  {
    kind: 'banking',
    label: 'Banking ledger',
    permission: 'reports.banking',
    statuses: [
      'deposit',
      'withdrawal',
      'transfer_debit',
      'transfer_credit',
      'reversal_debit',
      'reversal_credit',
    ],
  },
  {
    kind: 'accounts',
    label: 'Account reconciliation',
    permission: 'reports.banking',
    statuses: ['active', 'frozen', 'closed'],
  },
  {
    kind: 'branches',
    label: 'Branch activity',
    permission: 'reports.banking',
    statuses: ['active', 'inactive'],
  },
  {
    kind: 'payroll',
    label: 'Payroll register',
    permission: 'reports.payroll',
    statuses: ['draft', 'pending_approval', 'approved', 'processed', 'rejected', 'failed'],
  },
];
export default function ReportsPage() {
  const { user } = useAuth(),
    [params, setParams] = useSearchParams(),
    available = choices.filter((c) => user?.permissions.includes(c.permission + '.view'));
  const selected = available.find((c) => c.kind === params.get('kind')) || available[0],
    query = new URLSearchParams(params);
  query.delete('kind');
  const { data, error, loading, reload } = useRemote<ReportResult>(
      '/reports/' + selected?.kind + '?' + query,
      !!selected,
    ),
    [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState('');
  async function download() {
    setExporting(true);
    setExportError('');
    try {
      const response = await fetch('/api/v1/reports/' + selected.kind + '/export?' + query, {
        credentials: 'same-origin',
      });
      if (!response.ok) {
        const body = await response.json();
        if (response.status === 401) window.dispatchEvent(new Event('session-expired'));
        throw new Error(body.error?.message || 'Export failed.');
      }
      const blob = await response.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = 'ledgerline-' + selected.kind + '.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">REPORTS & RECONCILIATION</p>
          <h1>Reports</h1>
          <p>Trace every total back to the records behind it.</p>
        </div>
        {selected && user?.permissions.includes(selected.permission + '.export') && (
          <button
            className="button"
            disabled={loading || exporting || !!error}
            onClick={() => void download()}
          >
            {exporting ? 'Preparing export…' : 'Export CSV'}
          </button>
        )}
      </div>
      {!selected ? (
        <p className="notice">Your role does not allow reports.</p>
      ) : (
        <>
          <div className="report-tabs" role="group" aria-label="Report type">
            {available.map((c) => (
              <button
                className={'button ' + (selected.kind === c.kind ? '' : 'button-outline')}
                key={c.kind}
                onClick={() => {
                  setExportError('');
                  setParams({ kind: c.kind });
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
          <section className="records-panel">
            <DateFilters
              params={params}
              onChange={(v) => setParams({ ...v, kind: selected.kind })}
              search
              statuses={selected.statuses}
              dates={selected.kind !== 'accounts'}
            />
            <ErrorNotice message={error || exportError} />
            {loading ? (
              <p className="records-empty" role="status">
                Loading report…
              </p>
            ) : (
              data && (
                <>
                  <p className="report-note">{data.note}</p>
                  <div
                    className="table-scroll"
                    role="region"
                    tabIndex={0}
                    aria-label={selected.label}
                  >
                    <table className="records-table">
                      <thead>
                        <tr>
                          {data.columns.map((c) => (
                            <th key={c.key}>{c.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((r, i) => (
                          <tr key={String(r.id ?? i)}>
                            {data.columns.map((c) => (
                              <td key={c.key}>
                                {r[c.key] === null ? '—' : String(r[c.key] ?? '—')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!data.items.length && (
                    <p className="records-empty">No records match these filters.</p>
                  )}
                  <Pager
                    page={data.page}
                    total={data.total}
                    pageSize={data.pageSize}
                    onChange={(p) =>
                      setParams({
                        ...Object.fromEntries(params),
                        kind: selected.kind,
                        page: String(p),
                      })
                    }
                  />
                </>
              )
            )}
            {error && (
              <button className="button button-outline" onClick={reload}>
                Retry report
              </button>
            )}
          </section>
          <p className="records-footnote">
            Exports include all matching rows, up to 5,000. Narrow the filters for larger reports.
            Text that could become a spreadsheet formula is escaped.
          </p>
        </>
      )}
    </>
  );
}
