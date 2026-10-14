import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  Wallet,
  Receipt,
  ArrowRightLeft,
  ArrowRight,
  CalendarDays,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
const series = {
  October: [
    { day: '01 Oct', deposits: 42, withdrawals: 26 },
    { day: '05 Oct', deposits: 65, withdrawals: 38 },
    { day: '10 Oct', deposits: 53, withdrawals: 32 },
    { day: '15 Oct', deposits: 84, withdrawals: 48 },
    { day: '20 Oct', deposits: 70, withdrawals: 43 },
    { day: '25 Oct', deposits: 98, withdrawals: 56 },
  ],
  September: [
    { day: '01 Sep', deposits: 34, withdrawals: 22 },
    { day: '05 Sep', deposits: 48, withdrawals: 35 },
    { day: '10 Sep', deposits: 60, withdrawals: 41 },
    { day: '15 Sep', deposits: 55, withdrawals: 32 },
    { day: '20 Sep', deposits: 76, withdrawals: 47 },
    { day: '25 Sep', deposits: 82, withdrawals: 52 },
  ],
};
export default function DashboardPreviewPage() {
  const [period, setPeriod] = useState<'October' | 'September'>('October');
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE BIG PICTURE</p>
          <h1>Workspace overview</h1>
          <p>A little clarity for the day ahead.</p>
        </div>
        <Badge tone="neutral">Fictional dashboard preview</Badge>
      </div>
      <div className="metric-grid">
        {[
          {
            title: 'Total customers',
            value: '96',
            sub: 'Fictional customer profiles',
            Icon: Users,
          },
          {
            title: 'Account balances',
            value: '₹24,86,500',
            sub: 'Across 128 demo accounts',
            Icon: Wallet,
          },
          {
            title: 'Monthly payroll',
            value: '₹4,32,000',
            sub: '24 fictional employees',
            Icon: Receipt,
          },
          {
            title: 'Transactions',
            value: '1,284',
            sub: 'Illustrative activity count',
            Icon: ArrowRightLeft,
          },
        ].map(({ title, value, sub, Icon }) => (
          <Card key={title} className="metric-card">
            <div>
              <span>{title}</span>
              <Icon size={18} />
            </div>
            <strong>{value}</strong>
            <small>{sub}</small>
          </Card>
        ))}
      </div>
      <div className="dashboard-grid">
        <Card className="cash-card">
          <div className="card-heading">
            <div>
              <h2>Cash movement</h2>
              <p>Illustrative deposits and withdrawals · ₹ thousands</p>
            </div>
            <label className="period-select">
              <CalendarDays size={15} />
              <span className="sr-only">Chart preview month</span>
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value as typeof period)}
              >
                <option>October</option>
                <option>September</option>
              </select>
            </label>
          </div>
          <div className="chart-legend">
            <span>
              <i /> Deposits
            </span>
            <span>
              <i /> Withdrawals
            </span>
          </div>
          <div
            className="dashboard-chart"
            role="img"
            aria-label={`${period} fictional deposits and withdrawals; exact values are available in the table below.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series[period]} barGap={5}>
                <CartesianGrid vertical={false} stroke="#e9eeec" />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#637573' }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={30}
                  tick={{ fontSize: 11, fill: '#637573' }}
                />
                <Tooltip cursor={{ fill: '#f0f5f3' }} />
                <Bar
                  dataKey="deposits"
                  fill="#287267"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="withdrawals"
                  fill="#c8dfd1"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="data-disclosure">
            <summary>View illustrative chart data</summary>
            <div className="table-scroll">
              <table>
                <caption>{period} preview data (₹ thousands)</caption>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Deposits</th>
                    <th>Withdrawals</th>
                  </tr>
                </thead>
                <tbody>
                  {series[period].map((row) => (
                    <tr key={row.day}>
                      <th>{row.day}</th>
                      <td>{row.deposits}</td>
                      <td>{row.withdrawals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Card>
        <Card className="workspace-guide">
          <span className="guide-icon">
            <Receipt size={26} />
          </span>
          <p className="eyebrow">PEOPLE & PAYROLL</p>
          <h2>
            Every detail.
            <br />
            Every pay period.
          </h2>
          <p>Explore the planned payroll workflow, from preparation to approval and processing.</p>
          <div className="guide-step">
            <span>01</span> Prepare & calculate
          </div>
          <div className="guide-step">
            <span>02</span> Review & approve
          </div>
          <div className="guide-step">
            <span>03</span> Process & record
          </div>
          <Link to="/app/payroll" className="text-link">
            View payroll module <ArrowRight size={17} />
          </Link>
        </Card>
      </div>
      <Card className="recent-card">
        <div className="card-heading">
          <div>
            <h2>Recent activity</h2>
            <p>Fictional examples — these transactions did not occur.</p>
          </div>
          <Link className="text-link" to="/app/transactions">
            View module <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Reference</th>
                <th>Date</th>
                <th>Status</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  name: 'Account deposit',
                  person: 'Avery Shah',
                  ref: 'DEMO-0248',
                  date: '09 Oct 2026',
                  amount: '+ ₹12,500.00',
                  incoming: true,
                },
                {
                  name: 'Account transfer',
                  person: 'Robin Mehta',
                  ref: 'DEMO-0247',
                  date: '08 Oct 2026',
                  amount: '₹8,200.00',
                  incoming: false,
                },
                {
                  name: 'Account deposit',
                  person: 'Casey Rao',
                  ref: 'DEMO-0246',
                  date: '08 Oct 2026',
                  amount: '+ ₹25,000.00',
                  incoming: true,
                },
              ].map((row) => (
                <tr key={row.ref}>
                  <td>
                    <div className="transaction-cell">
                      <span className="transaction-icon">
                        {row.incoming ? <ArrowDownLeft size={17} /> : <ArrowRightLeft size={17} />}
                      </span>
                      <span>
                        <strong>{row.name}</strong>
                        <small>{row.person} · fictional</small>
                      </span>
                    </div>
                  </td>
                  <td>{row.ref}</td>
                  <td>{row.date}</td>
                  <td>
                    <Badge>Demo completed</Badge>
                  </td>
                  <td className="text-right amount">{row.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
