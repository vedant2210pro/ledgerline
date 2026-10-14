import { useAuth } from '../auth/context';
import { useRemote } from '../hooks/useRemote';
import { ErrorNotice } from '../components/finance/Controls';
export default function SystemPage() {
  const { user } = useAuth(),
    allowed = !!user?.permissions.includes('settings.administer');
  const { data, loading, error, reload } = useRemote<{
    currency: string;
    recordTimezone: string;
    sessionHours: number;
    payrollMode: string;
    accounts: number;
    discrepancies: number;
  }>('/system', allowed);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE INFORMATION</p>
          <h1>System settings</h1>
          <p>Read-only operating policies and live reconciliation status.</p>
        </div>
        <button className="button button-outline" onClick={reload}>
          Refresh status
        </button>
      </div>
      {!allowed ? (
        <p className="notice">Administrator access is required.</p>
      ) : (
        <>
          <ErrorNotice message={error} />
          {loading ? (
            <p role="status">Loading system information…</p>
          ) : (
            data && (
              <section className="records-panel record-form-panel">
                <dl className="review-details">
                  <div>
                    <dt>Currency</dt>
                    <dd>{data.currency}</dd>
                  </div>
                  <div>
                    <dt>Record timestamps</dt>
                    <dd>{data.recordTimezone}</dd>
                  </div>
                  <div>
                    <dt>Session lifetime</dt>
                    <dd>{data.sessionHours} hours</dd>
                  </div>
                  <div>
                    <dt>Account reconciliation</dt>
                    <dd>
                      {data.discrepancies === 0
                        ? 'All ' + data.accounts + ' accounts reconcile'
                        : data.discrepancies + ' accounts need investigation'}
                    </dd>
                  </div>
                  <div>
                    <dt>Payroll</dt>
                    <dd>{data.payrollMode}</dd>
                  </div>
                </dl>
                <p className="notice">
                  Currency, session security and database connection settings are managed through
                  the server configuration. This screen does not expose credentials or permit
                  balance changes.
                </p>
              </section>
            )
          )}
        </>
      )}
    </>
  );
}
