import { Database, Fingerprint, GitBranch, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
export default function Workflow() {
  return (
    <>
      <section className="workflow-section" id="workflow">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">A THOUGHTFUL FLOW</p>
              <h2>
                From the first record
                <br />
                to the full picture.
              </h2>
            </div>
            <p>A practical approach to banking and payroll, built one verified phase at a time.</p>
          </div>
          <div className="workflow-grid">
            {[
              {
                n: '01',
                title: 'Bring records together',
                text: 'Organize customers, accounts, employees, and branches around clear relationships.',
              },
              {
                n: '02',
                title: 'Move with confidence',
                text: 'Validate transactions and review payroll through explicit approval steps.',
              },
              {
                n: '03',
                title: 'See the whole story',
                text: 'Follow activity, reconcile totals, and explore financial reports by period.',
              },
            ].map((item) => (
              <article key={item.n}>
                <span>{item.n}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="integrity-section container" id="integrity">
        <div className="integrity-copy">
          <p className="eyebrow">BUILT WITH CARE</p>
          <h2>
            Trust starts
            <br />
            with the foundations.
          </h2>
          <p>
            Good financial software is more than a dashboard. Our implementation plan puts data
            integrity, clear permissions, and accountable records first.
          </p>
          <Link className="text-link" to="/app/audit-logs">
            See the audit module <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="integrity-list">
          {[
            {
              Icon: Database,
              title: 'A relational foundation',
              text: 'Planned MySQL 8 relationships, constraints, and atomic transactions keep records consistent.',
            },
            {
              Icon: Fingerprint,
              title: 'Access with intention',
              text: 'Planned server-enforced roles separate banking, payroll, administration, and audit responsibilities.',
            },
            {
              Icon: GitBranch,
              title: 'History that stays with you',
              text: 'Planned immutable transaction records and audit trails preserve the context behind changes.',
            },
          ].map(({ Icon, title, text }) => (
            <article key={title}>
              <span>
                <Icon size={23} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
          <p className="integrity-note">
            These safeguards are implementation commitments, not security certifications or features
            verified in this preview.
          </p>
        </div>
      </section>
    </>
  );
}
