import { useSearchParams } from 'react-router-dom';
import { useRemote } from '../hooks/useRemote';
import { useAuth } from '../auth/context';
import { DateFilters } from '../components/finance/DateFilters';
import { ErrorNotice, Pager } from '../components/finance/Controls';
type Audit = {
  id: string;
  created_at: string;
  actor: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_values: unknown;
  after_values: unknown;
  http_request_id: string | null;
};
export default function AuditPage() {
  const { user } = useAuth(),
    [params, setParams] = useSearchParams(),
    allowed = !!user?.permissions.includes('audit.view');
  const { data, loading, error, reload } = useRemote<{
    items: Audit[];
    total: number;
    page: number;
    pageSize: number;
  }>('/audit-logs?' + params, allowed);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCOUNTABILITY</p>
          <h1>Audit history</h1>
          <p>See who changed a record, when it changed and the recorded details.</p>
        </div>
        <button className="button button-outline" onClick={reload}>
          Refresh audit history
        </button>
      </div>
      {!allowed ? (
        <p className="notice">Your role cannot browse audit history.</p>
      ) : (
        <section className="records-panel">
          <DateFilters params={params} onChange={setParams} search />
          <ErrorNotice message={error} />
          {loading ? (
            <p className="records-empty" role="status">
              Loading audit history…
            </p>
          ) : (
            data && (
              <>
                <div className="table-scroll">
                  <table className="records-table">
                    <thead>
                      <tr>
                        {['Time (UTC)', 'Actor', 'Action', 'Record', 'Details'].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((r) => (
                        <tr key={r.id}>
                          <td>{r.created_at}</td>
                          <td>{r.actor || 'System'}</td>
                          <td>{r.action}</td>
                          <td>
                            {r.entity_type}
                            {r.entity_id ? ' #' + r.entity_id : ''}
                          </td>
                          <td>
                            <details>
                              <summary>View change</summary>
                              <div className="audit-detail">
                                <strong>Before</strong>
                                <pre>{JSON.stringify(r.before_values, null, 2) || '—'}</pre>
                                <strong>After</strong>
                                <pre>{JSON.stringify(r.after_values, null, 2) || '—'}</pre>
                                {r.http_request_id && <small>Request: {r.http_request_id}</small>}
                              </div>
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!data.items.length && (
                  <p className="records-empty">No audit entries match these filters.</p>
                )}
                <Pager
                  page={data.page}
                  total={data.total}
                  pageSize={data.pageSize}
                  onChange={(p) => setParams({ ...Object.fromEntries(params), page: String(p) })}
                />
              </>
            )
          )}
        </section>
      )}
    </>
  );
}
