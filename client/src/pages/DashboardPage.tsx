import { Link, useSearchParams } from 'react-router-dom';
import type { DashboardResult } from '@ledgerline/shared';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useAuth } from '../auth/context';
import { useRemote, money } from '../hooks/useRemote';
import { DateFilters } from '../components/finance/DateFilters';
import { ErrorNotice } from '../components/finance/Controls';
function Stat({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <article className="live-stat">
      <p>{title}</p>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
export default function DashboardPage() {
  const { user } = useAuth(),
    [params, setParams] = useSearchParams(),
    allowed = !!user?.permissions.some((p) =>
      ['reports.banking.view', 'reports.payroll.view'].includes(p),
    );
  const { data, loading, error, reload } = useRemote<DashboardResult>(
    '/dashboard?' + params,
    allowed,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LIVE WORKSPACE</p>
          <h1>Good to see you, {user?.name.split(' ')[0]}.</h1>
          <p>Your banking and payroll activity, directly from your database.</p>
        </div>
        <button className="button button-outline" onClick={reload}>
          Refresh dashboard
        </button>
      </div>
      {!allowed ? (
        <p className="notice">Your role does not include dashboard reports.</p>
      ) : (
        <>
          <section className="records-panel">
            <DateFilters params={params} onChange={setParams} />
          </section>
          <ErrorNotice message={error} />
          {loading ? (
            <p className="records-empty" role="status">
              Loading live dashboard…
            </p>
          ) : (
            data && (
              <>
                <p className="records-footnote">
                  Activity: {data.date_from} to {data.date_to} (UTC). Current account balances and
                  record counts are not historical snapshots.
                </p>
                {data.banking && (
                  <>
                    <div className="live-stats">
                      <Stat
                        title="Current account balances"
                        value={money(data.banking.balance)}
                        note="Includes preserved imported openings"
                      />
                      <Stat
                        title="Accounts"
                        value={String(data.banking.accounts)}
                        note={
                          data.banking.frozen + ' frozen · ' + data.banking.customers + ' customers'
                        }
                      />
                      <Stat
                        title="Gross deposits"
                        value={money(data.banking.deposits)}
                        note="Original deposits in selected dates"
                      />
                      <Stat
                        title="Gross withdrawals"
                        value={money(data.banking.withdrawals)}
                        note="Original withdrawals in selected dates"
                      />
                    </div>
                    <section className="records-panel chart-panel">
                      <div className="section-heading">
                        <div>
                          <h2>Banking activity</h2>
                          <p>
                            Ledger credits and debits include transfers and reversals. Original
                            transfer volume: {money(data.banking.transfers)}.
                          </p>
                        </div>
                        <Link className="text-link" to="/app/reports?kind=banking">
                          Banking report →
                        </Link>
                      </div>
                      {data.banking.trend.length ? (
                        <>
                          <div
                            className="live-chart"
                            role="img"
                            aria-label="Daily ledger credits and debits; exact values available in the table below"
                          >
                            <ResponsiveContainer width="100%" height={280}>
                              <AreaChart
                                data={data.banking.trend.map((r) => ({
                                  ...r,
                                  credits: Number(r.credits),
                                  debits: Number(r.debits),
                                }))}
                              >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis
                                  dataKey="day"
                                  tickFormatter={(v) => String(v).slice(5)}
                                  minTickGap={35}
                                />
                                <YAxis
                                  tickFormatter={(v) =>
                                    '₹' +
                                    new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(
                                      Number(v),
                                    )
                                  }
                                  width={76}
                                />
                                <Tooltip />
                                <Legend />
                                <Area
                                  type="monotone"
                                  dataKey="credits"
                                  name="Credits · INR"
                                  stroke="#28775a"
                                  fill="#dbeee4"
                                />
                                <Area
                                  type="monotone"
                                  dataKey="debits"
                                  name="Debits · INR"
                                  stroke="#b97936"
                                  fill="#f5e7d6"
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                          <details>
                            <summary>Exact daily amounts</summary>
                            <div className="table-scroll">
                              <table className="records-table">
                                <thead>
                                  <tr>
                                    <th>Date</th>
                                    <th>Credits</th>
                                    <th>Debits</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {data.banking.trend.map((t) => (
                                    <tr key={t.day}>
                                      <td>{t.day}</td>
                                      <td>{money(t.credits)}</td>
                                      <td>{money(t.debits)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        </>
                      ) : (
                        <div className="records-empty">
                          <h3>No postings in this period</h3>
                          <p>
                            Imported opening balances are preserved separately. New transactions
                            will populate this chart.
                          </p>
                          <Link className="text-link" to="/app/transactions">
                            Open transactions →
                          </Link>
                        </div>
                      )}
                    </section>
                    <section className="records-panel related-records">
                      <h2>Recent banking activity</h2>
                      {data.banking.recent.length ? (
                        <div className="table-scroll">
                          <table className="records-table">
                            <thead>
                              <tr>
                                <th>Reference</th>
                                <th>Account</th>
                                <th>Type</th>
                                <th>Amount</th>
                                <th>UTC date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.banking.recent.map((r) => (
                                <tr key={r.id}>
                                  <td>
                                    <Link
                                      to={
                                        '/app/transactions?search=' +
                                        encodeURIComponent(r.reference_number)
                                      }
                                      className="record-link receipt-reference"
                                    >
                                      {r.reference_number}
                                    </Link>
                                  </td>
                                  <td>{r.account_number}</td>
                                  <td>{r.transaction_type.replaceAll('_', ' ')}</td>
                                  <td>{money(r.amount)}</td>
                                  <td>{r.transaction_date}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p>No banking activity in this date range.</p>
                      )}
                    </section>
                  </>
                )}
                {data.payroll && (
                  <>
                    <div className="live-stats payroll-stats">
                      <Stat
                        title="Employees"
                        value={String(data.payroll.employees)}
                        note="Current employee records"
                      />
                      <Stat
                        title="Processed net payroll"
                        value={money(data.payroll.processed)}
                        note="Selected payroll periods · internal processing"
                      />
                      <Stat
                        title="Awaiting approval"
                        value={String(data.payroll.pending)}
                        note="Selected payroll periods"
                      />
                    </div>
                    <section className="records-panel chart-panel">
                      <div className="section-heading">
                        <div>
                          <h2>Payroll by month</h2>
                          <p>Processed net salary, grouped by payroll period.</p>
                        </div>
                        <Link className="text-link" to="/app/payroll">
                          Manage payroll →
                        </Link>
                      </div>
                      {data.payroll.trend.length ? (
                        <>
                          <div
                            className="live-chart"
                            role="img"
                            aria-label="Monthly processed payroll; exact values available below"
                          >
                            <ResponsiveContainer width="100%" height={260}>
                              <BarChart
                                data={data.payroll.trend.map((r) => ({ ...r, net: Number(r.net) }))}
                              >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="month" />
                                <YAxis
                                  width={76}
                                  tickFormatter={(v) =>
                                    '₹' +
                                    new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(
                                      Number(v),
                                    )
                                  }
                                />
                                <Tooltip />
                                <Bar
                                  dataKey="net"
                                  name="Net salary · INR"
                                  fill="#28775a"
                                  radius={[6, 6, 0, 0]}
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <details>
                            <summary>Exact monthly amounts</summary>
                            <ul className="audit-timeline">
                              {data.payroll.trend.map((r) => (
                                <li key={r.month}>
                                  {r.month} · {r.count} employees · {money(r.net)}
                                </li>
                              ))}
                            </ul>
                          </details>
                        </>
                      ) : (
                        <div className="records-empty">
                          <h3>No processed payroll in this period</h3>
                          <p>Approved payroll appears here once it is processed.</p>
                        </div>
                      )}
                    </section>
                    <section className="records-panel related-records">
                      <h2>Recent payroll records</h2>
                      {data.payroll.recent.length ? (
                        <ul>
                          {data.payroll.recent.map((r) => (
                            <li key={r.id}>
                              <Link className="record-link" to={'/app/payroll/' + r.id}>
                                {r.employee}
                              </Link>
                              <span>
                                {r.payroll_period} · {r.payroll_status.replaceAll('_', ' ')}
                              </span>
                              <span>{money(r.net_salary)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No payroll records in this date range.</p>
                      )}
                    </section>
                  </>
                )}
              </>
            )
          )}
        </>
      )}
      <div className="dashboard-shortcuts">
        {[
          ['customers', 'Customers'],
          ['accounts', 'Accounts'],
          ['employees', 'Employees'],
          ['branches', 'Branches'],
        ]
          .filter(([p]) => user?.permissions.includes(p + '.view'))
          .map(([p, label]) => (
            <Link className="button button-outline" key={p} to={'/app/' + p}>
              {label} →
            </Link>
          ))}
      </div>
    </>
  );
}
