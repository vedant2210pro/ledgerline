# Project status

Updated: 15 October 2026 (Asia/Kolkata).

## Current checkpoint

**Phases 3–9 are implemented and verified locally.** The user has deployed to Vercel with Aiven MySQL. The latest local update adds administrator opening-balance review and fixes payroll edit retention, misleading loading errors and account-freezing eligibility. Apply the cloud grants before deploying this update; see [final audit and release steps](FINAL_AUDIT_2026_10_15.md). Manual responsive/browser acceptance remains outstanding.

## Working features

- Authenticated customer, account, branch and employee management with search, filters, pagination, strict validation, optimistic versions and atomic audit entries.
- Deposits, withdrawals, transfers, transaction history, reference receipts and controlled reversals. Transfers and their reversals post both sides atomically.
- Review-before-post screens retain the exact pending request and key in session storage through uncertain network results. No balance editing is exposed.
- Payroll drafts, edits, exact-decimal previews, submission, independent approval/rejection and idempotent processing. Editing a draft changes its preparer to the editor so an approver cannot edit then self-approve.
- Monthly payroll summaries and per-record audit history. Processed payroll and posted financial history are immutable.
- Nine SQL routines (eight procedures and one function), six modern reporting views, ten additional history triggers, and EXPLAIN queries covering indexed date searches, joins, grouping/HAVING, subqueries and CTEs.
- Local Express/Vite development and the existing Vercel function adapter. Payroll processing is an internal academic status change, not an external payment.

- Live permission-scoped dashboard with date-filtered charts and exact-value tables; four filtered report types and audited CSV exports.
- User creation, fixed-role assignment, password reset and session revocation with optimistic versions and protection against administrator lockout.
- Paginated audit browsing and read-only system/reconciliation status.

## Data preservation

- Main database: 29 base tables, 12 legacy-upgrade migrations, 35 foreign keys, 51 CHECK constraints and 22 UNIQUE constraints.
- Test database: 23 base tables and 13 clean-install migrations.
- Migrations 010–013 are identical on both tracks. Previously applied migrations were not edited.
- All 61 original rows, five legacy views and two legacy triggers remain preserved. Source digest: `ddf2ae493a6f1dcaff3854ea41e796f45aab56ac634da80dfde659283d5c77a0`.
- Main modern data remains 10 customers, 10 employees, 10 branches, 10 frozen accounts, zero new banking postings and zero new payroll records. Eleven historical payroll periods remain reserved; two ambiguous legacy transfers remain unresolved.
- Pre-upgrade backup: `database/backups/forward-20261013043946354/legacy.sql`, with SHA-256 alongside it. Folder timestamp is UTC. Prior recovery backups are retained.
- Main and test accounts reconcile against preserved opening balances plus signed modern ledger entries.

## Validation

**114 automated tests pass:** 24 MySQL schema tests, 55 API tests, and 35 React/jsdom component tests. Coverage includes concurrent financial operations, reversals, independent payroll approval, runtime privileges, opening-review authorization/concurrency/rollback, source verification, retained payroll edits and actionable loading errors.

Lint, TypeScript checks and the production build pass. Authenticated main-database readiness, dashboard, all four reports, users, roles, audit logs, system information, login and logout passed without changing business records. Built JS/CSS contained none of the configured credentials or authentication secret. EXPLAIN evidence is available through `db:verify:financial`; small datasets use full scans for several aggregates, so no production performance benchmark is claimed.

Interactive visual/responsive browser review remains outstanding: the browser tool previously rejected local-page access. Component tests cover behavior, not screenshot quality. The latest fixes have not been verified on the hosted deployment, and no production load/security certification is claimed. The build retains two harmless upstream Zod comment-annotation warnings.

## Run locally

```powershell
npm run dev
```

Open `http://127.0.0.1:5173/login`. Your administrator credentials remain in the ignored `.env.admin.json`; `.env` holds separate administrative and restricted runtime database credentials. Never upload either file. Verification servers are stopped.

Imported accounts require an opening-balance review before activation. Administrators can now perform that review on the account detail page after checking the source and reconciliation; activation is a separate action. Imported employees require confirmed designation/joining date before payroll. Payroll approval requires a second active authorized person; use the Users screen to provision a real independent reviewer.

## Verification commands

```powershell
npm run db:test
npm run api:test
npm run ui:test
npm run lint
npm run build
npm run db:verify
npm run db:upgrade:verify
npm run db:verify:financial
node database/verify-financial.ts --test
```

Financial tests retain their committed fictional history only in `banking_payroll_test` and disable their temporary users afterward. Do not delete posted fixtures or reset the main database to clean tests. The legacy cutover verifier asserts the unchanged imported state; after real profile changes, distinguish audited changes from loss of original source data.

See `CONNECT_AND_VISUALIZE.md`, `PHASE_8_9_VERIFICATION.md`, `PHASE_8_9_PLAN.md`, `PHASE_6_7_VERIFICATION.md`, `PHASE_3_PLAN.md`, `PHASE_6_7_PLAN.md`, `API_DOCUMENTATION.md` and `VERCEL_DEPLOYMENT.md`.
