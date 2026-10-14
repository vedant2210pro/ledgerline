const questions = [
  [
    'Is Ledgerline a real banking service?',
    'No. Ledgerline is an academic banking and payroll management project. It does not hold funds, execute real money transfers, or provide regulated banking services. All preview figures and identities are fictional.',
  ],
  [
    'What can I use in this release?',
    'Authorized users can sign in and manage customer, account and branch records. The public dashboard preview is fictional. Transaction processing, payroll workflows and live analytics are still being built.',
  ],
  [
    'How will banking and payroll data be stored?',
    'The implementation plan uses MySQL 8 with relational tables, constraints, views, triggers, and stored procedures. No financial records will be persisted in browser localStorage. MySQL connectivity is not implemented in this release.',
  ],
  [
    'Can this project be deployed on Vercel?',
    'Yes. This frontend is configured for Vercel. Later phases add the Express API as a Node function. The full system will require a separately hosted MySQL 8 database and server-side environment configuration.',
  ],
  [
    'Who is the workspace designed for?',
    'The planned roles are Administrator, Banking Staff, Payroll Manager, and Read-Only Auditor. Role enforcement and secure login will be implemented in Phase 4.',
  ],
];
export default function Faq() {
  return (
    <section className="faq-section container" id="faq">
      <div>
        <p className="eyebrow">A LITTLE MORE CLARITY</p>
        <h2>
          Good questions.
          <br />
          Straight answers.
        </h2>
      </div>
      <div className="faq-list">
        {questions.map(([question, answer]) => (
          <details key={question}>
            <summary>
              {question}
              <span aria-hidden="true">+</span>
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
