import {
  ArrowUpRight,
  Landmark,
  UsersRound,
  ChartNoAxesCombined,
  Check,
  FileText,
  ArrowRightLeft,
} from 'lucide-react';
import { Link } from 'react-router-dom';
export default function Features() {
  return (
    <section className="section container" id="features">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ONE WORKSPACE. TWO SIDES OF FINANCE.</p>
          <h2>
            Connected by design.
            <br />
            Clear from the start.
          </h2>
        </div>
        <p>
          From customer accounts to employee payslips, explore a system designed to make every
          record easier to follow.
        </p>
      </div>
      <div className="feature-grid">
        <article className="feature-panel banking">
          <div className="feature-icon">
            <Landmark size={23} />
          </div>
          <span className="feature-number">01 / BANKING</span>
          <h3>
            A place for every account.
            <br />A trail for every transaction.
          </h3>
          <p>
            Designed to connect customers, accounts, and branches, with traceable deposits,
            withdrawals, and transfers.
          </p>
          <div className="account-illustration" aria-label="Illustrative account card">
            <div>
              <span>LEDGERLINE / DEMO ACCOUNT</span>
              <Landmark size={19} />
            </div>
            <span className="account-number">•••• &nbsp; •••• &nbsp; 0248</span>
            <div>
              <span>
                AVERY SHAH
                <br />
                <small>Fictional account holder</small>
              </span>
              <span>SAVINGS</span>
            </div>
          </div>
          <Link className="text-link" to="/app/accounts">
            Explore banking <ArrowUpRight size={17} />
          </Link>
        </article>
        <article className="feature-panel payroll">
          <div className="feature-icon">
            <UsersRound size={23} />
          </div>
          <span className="feature-number">02 / PEOPLE & PAYROLL</span>
          <h3>
            Care for your people.
            <br />
            Clarity in their payroll.
          </h3>
          <p>
            A planned workflow from salary calculation to approval, with employee records and
            period-based payroll history.
          </p>
          <div className="payroll-illustration">
            <div className="payroll-title">
              <span className="document-icon">
                <FileText size={20} />
              </span>
              <div>
                <strong>October payroll</strong>
                <small>Illustrative calculation</small>
              </div>
              <span className="mini-pill">Preview</span>
            </div>
            <div>
              <span>Base salary + bonus</span>
              <strong>₹52,000.00</strong>
            </div>
            <div>
              <span>Deductions</span>
              <strong>− ₹2,000.00</strong>
            </div>
            <div className="net-row">
              <span>Net salary</span>
              <strong>₹50,000.00</strong>
            </div>
          </div>
          <Link className="text-link" to="/app/payroll">
            Explore payroll <ArrowUpRight size={17} />
          </Link>
        </article>
      </div>
      <article className="report-strip">
        <span className="report-icon">
          <ChartNoAxesCombined size={27} />
        </span>
        <div>
          <p className="eyebrow">THE BIGGER PICTURE</p>
          <h3>Turn records into perspective.</h3>
          <p>
            Planned reports bring transaction trends, branch activity, and payroll expenditure
            together.
          </p>
        </div>
        <Link className="text-link" to="/app/reports">
          Explore reporting <ArrowUpRight size={17} />
        </Link>
      </article>
      <div className="capability-line">
        <span>
          <Check size={15} /> Customer & account records
        </span>
        <span>
          <ArrowRightLeft size={15} /> Traceable activity
        </span>
        <span>
          <Check size={15} /> Payroll approval workflow
        </span>
        <span>
          <Check size={15} /> Period-based reporting
        </span>
      </div>
      <p className="section-disclaimer">
        Sign-in and customer, account and branch management are available to authorized users. Financial transactions, payroll and reporting are still being built.</p>
    </section>
  );
}
