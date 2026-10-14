import { Link } from 'react-router-dom';
import { Users, Wallet, Building2, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/context';
export default function WorkspacePage() {
  const { user } = useAuth();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>Welcome, {user?.name.split(' ')[0]}.</h1>
          <p>Your records, clearly organized. Choose where you’d like to start.</p>
        </div>
        <span className="live-tag">
          <ShieldCheck size={16} /> Signed in
        </span>
      </div>
      <div className="workspace-cards">
        {[
          {
            path: 'transactions',
            title: 'Transactions',
            text: 'Deposit, withdraw, transfer and review posted history.',
            Icon: Wallet,
          },
          {
            path: 'employees',
            title: 'Employees',
            text: 'Maintain employment details and payroll eligibility.',
            Icon: Users,
          },
          {
            path: 'payroll',
            title: 'Payroll',
            text: 'Prepare, independently approve and process payroll.',
            Icon: ShieldCheck,
          },
          {
            path: 'customers',
            title: 'Customers',
            text: 'Keep customer profiles and account relationships up to date.',
            Icon: Users,
          },
          {
            path: 'accounts',
            title: 'Bank accounts',
            text: 'Open zero-balance accounts and manage permitted status changes.',
            Icon: Wallet,
          },
          {
            path: 'branches',
            title: 'Branches',
            text: 'Maintain branch contact information and availability.',
            Icon: Building2,
          },
        ]
          .filter((m) => user?.permissions.includes(m.path + '.view'))
          .map(({ path, title, text, Icon }) => (
            <Link key={path} className="workspace-card" to={'/app/' + path}>
              <span className="module-icon">
                <Icon size={26} />
              </span>
              <h2>{title}</h2>
              <p>{text}</p>
              <span className="text-link">
                Open {title.toLowerCase()}
                <ArrowUpRight size={17} />
              </span>
            </Link>
          ))}
      </div>
      <section className="notice">
        <strong>Banking and payroll are ready.</strong>
        <p>
          Live dashboard analytics are the next phase. Payroll processing records internal
          completion only. Imported accounts stay frozen until their opening balances are reviewed.
        </p>
        <Link to="/preview" className="text-link">
          View the separate fictional dashboard illustration
        </Link>
      </section>
    </>
  );
}
