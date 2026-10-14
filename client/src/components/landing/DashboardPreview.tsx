import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  LayoutDashboard,
  Users,
  Wallet,
  Building2,
  MoreHorizontal,
  ChevronDown,
  CircleHelp,
} from 'lucide-react';
import Badge from '../ui/Badge';
const bars = [35, 48, 41, 67, 49, 71, 58, 81, 66, 90, 76, 97];
export default function DashboardPreview() {
  return (
    <div
      className="product-preview"
      aria-label="Fictional dashboard illustration, not connected to a database"
    >
      <aside className="preview-rail" aria-hidden="true">
        <span className="mini-mark">L</span>
        <LayoutDashboard className="selected" />
        <Users />
        <Wallet />
        <ArrowRightLeft />
        <Building2 />
        <CircleHelp className="rail-bottom" />
      </aside>
      <div className="preview-body">
        <div className="preview-top">
          <span>
            Workspace <span className="slash">/</span> Overview
          </span>
          <span className="avatar">JD</span>
        </div>
        <div className="preview-heading">
          <div>
            <span className="eyebrow">YOUR WORKSPACE, AT A GLANCE</span>
            <h3>A clearer view of every day.</h3>
          </div>
          <span className="preview-period">
            October 2026 <ChevronDown size={12} />
          </span>
        </div>
        <div className="preview-metrics">
          <div>
            <span>Total account balance</span>
            <strong>
              ₹24,86,500<span>.00</span>
            </strong>
            <small>Across 128 demo accounts</small>
          </div>
          <div>
            <span>Monthly payroll</span>
            <strong>
              ₹4,32,000<span>.00</span>
            </strong>
            <small>24 fictional employees</small>
          </div>
          <div>
            <span>Transactions</span>
            <strong>1,284</strong>
            <small>Illustrative activity</small>
          </div>
        </div>
        <div className="preview-chart">
          <div className="chart-title">
            <strong>Cash movement</strong>
            <span>
              <i /> Deposits <i /> Withdrawals
            </span>
          </div>
          <div className="bar-chart" aria-hidden="true">
            <div className="chart-grid">
              <span>₹6L</span>
              <span>₹4L</span>
              <span>₹2L</span>
              <span>0</span>
            </div>
            <div className="bars">
              {bars.map((height, index) => (
                <div className="bar-pair" key={index}>
                  <i style={{ height: `${height}%` }} />
                  <i style={{ height: `${height * 0.62}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="chart-months">
            <span>01 Oct</span>
            <span>07 Oct</span>
            <span>14 Oct</span>
            <span>21 Oct</span>
            <span>28 Oct</span>
          </div>
        </div>
        <div className="preview-activity">
          <div className="chart-title">
            <strong>Recent activity</strong>
            <MoreHorizontal size={17} />
          </div>
          <div className="activity-row">
            <span className="transaction-icon">
              <ArrowDownLeft size={16} />
            </span>
            <div>
              <strong>Account deposit</strong>
              <small>LL-00248 · Fictional example</small>
            </div>
            <Badge>Completed</Badge>
            <b>+ ₹12,500</b>
          </div>
          <div className="activity-row">
            <span className="transaction-icon pale">
              <ArrowUpRight size={16} />
            </span>
            <div>
              <strong>Payroll batch</strong>
              <small>October · Fictional example</small>
            </div>
            <Badge tone="amber">In review</Badge>
            <b>₹4,32,000</b>
          </div>
        </div>
      </div>
      <div className="preview-caption">
        <span className="status-dot" /> PRODUCT PREVIEW{' '}
        <span>Fictional figures. No live financial data.</span>
      </div>
    </div>
  );
}
