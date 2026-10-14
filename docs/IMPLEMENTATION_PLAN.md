# Banking and Payroll Management System — implementation plan

Prepared 11 October 2026. Phase 1 was approved and is now implemented. See PROJECT_STATUS.md and PHASE_1_VERIFICATION.md for verified results. Later phases retain their explicit approval checkpoints.

## 1. Environment and current state

- Workspace: `D:\DBMS`, initially empty, with no application, dependencies, configuration, Git repository, or existing project instructions.
- Windows PowerShell; Node.js `v24.20.0`, npm `11.19.0`, Git `2.51.0.windows.1`, and ripgrep available.
- Windows service `MySQL80` is running. MySQL client exists at `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe`, although it is not on PATH.
- Database login, server version, schema, privileges, and connectivity have not been verified. No credentials were requested or tried.
- Docker and Vercel CLI are not on PATH. Neither is required to start frontend development.
- A service metadata query through CIM returned access denied; service status was successfully read separately. No privileged service inspection is needed for Phase 0.
- No dependencies installed, application built, database modified, or deployment performed.

## 2. Architecture and deployment decision

Preserve the mandatory React/Vite/TypeScript and Express/TypeScript stack. Use one repository and one Vercel project, with static frontend output and an Express adapter in a Vercel Node function. The exact API rewrite must be verified with the chosen Vercel configuration during backend integration.

```text
Browser
  -> Vercel static assets: React + Vite + React Router
  -> same-origin /api/v1/*: Vercel Node function -> Express
       -> authentication / permissions / Zod validation
       -> services -> repositories -> mysql2 pool
       -> external MySQL 8 / InnoDB over verified TLS
```

Frontend libraries: Tailwind CSS, Lucide React, Recharts, React Hook Form, and Zod. Install compatible stable versions at the phase where needed, inspect package engine and peer requirements, and commit the npm lockfile. Use npm workspaces for `client`, `server`, and shared contracts. Do not introduce Next.js, a replacement database, or an ORM.

The Express app exports independently of its local listening server so Supertest and Vercel use the same application. An `api/index.ts` adapter mounts it on Vercel. `/api/*` routing takes precedence over the React Router fallback; unknown API paths return JSON 404s, not the SPA. Static asset paths remain intact. Check direct navigation and reload on every frontend route.

Vercel hosts the application, not a MySQL server process. Local MySQL supports development; deployment needs a separately hosted MySQL 8 instance reachable from the functions. Select its region alongside the function region. Before choosing a provider, verify support for triggers, routines, functions, views, CHECK constraints, required grants, and connection limits. No provider subscription is assumed.

Use a bounded module-level mysql2 pool, finite acquisition/query timeouts, and Vercel pool lifecycle support after checking compatibility with the selected package versions. Always release checked-out connections in `finally`. Do not rely on instance-local sessions, rate-limit counters, local disk persistence, or background timers. Run migrations explicitly from a trusted administrative environment, never on a request, cold start, or routine frontend build.

Deployment target: repository root; install with `npm ci`, build with `npm run build`, static output `client/dist`. Phase 1 produces a deployable frontend; backend functionality arrives in later phases. Backend secrets stay in Vercel server environment variables, never `VITE_*`. Keep development, preview, and production databases separate; do not automatically seed deployed databases. Use a supported matching Node major locally and in Vercel, verified when configuring deployment.

Sources checked during planning:
- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)
- [Database pools in Fluid compute](https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute)

## 3. Domain and database design

Database name: `banking_payroll_db`. Core physical tables: `customers`, `accounts`, `employees`, `payroll`, `banking_transactions`, and `branches`. Preserve all fields and relationships specified in the master prompt. Use account numbers and transaction references with unique constraints. Add active/status fields where needed to preserve historical records.

Supporting tables and reasons:
- `users`, `roles`, `permissions`, `user_roles`, `role_permissions`: login identities and explicit permissions.
- `sessions`: hashed opaque session tokens, expiry, revocation, and user linkage across function instances.
- `audit_logs`: actor, action, entity, timestamp, request reference, and redacted before/after values.
- `transfers`: links both financial entries and preserves transfer-level metadata.
- `operation_requests`: unique actor/operation/idempotency key and payload fingerprint, preventing duplicate execution and key reuse with different payloads.
- `login_attempts`: shared, bounded brute-force protection across instances, with cleanup policy.
- `schema_migrations`: applied migration identifiers and checksums; migrations are authoritative.

Use `DECIMAL(18,2)` for money, and return monetary values as decimal strings in API contracts. No authoritative floating-point calculations in JavaScript. Start with a single documented currency, INR; no foreign-exchange behavior. Store timestamps in UTC and use ISO dates for business dates and payroll periods.

Accounts start at zero; fictional opening funds use the same deposit routine as normal demonstration operations. No API accepts arbitrary balance updates. Restrict deletes on historical foreign keys; deactivate records instead. Completed transaction rows are immutable, and authorized corrections create linked compensating entries with a reason.

`payroll.salary_amount` means the base salary for that period, not an employee's master salary. Gross = base + bonus; net = gross - deductions. Validate nonnegative inputs and deductions <= gross. Enforce one payroll record per employee and period. Rejected drafts may be revised through an audited transition; processed records cannot be edited. Processing records an internal academic disbursement status, not an external payment or bank transfer.

Financial stored procedures own START TRANSACTION, COMMIT, exception handling, and ROLLBACK. The API does not nest another transaction around them. Lock accounts in ascending ID order, validate status and available balance under the lock, and create history/audit/idempotency records in the same transaction. Replays return the original result; changed payloads with the same key fail. A failed attempt must not leave balances, history, or request records partially committed. Apply bounded retry only to eligible transient errors with idempotency preserved.

Implement `sp_deposit_money`, `sp_withdraw_money`, `sp_transfer_money`, `sp_process_payroll`, and a controlled reversal routine. Use `calculate_net_salary` in payroll computation. Prevent duplicate payroll processing under concurrent requests. Procedures receive the authenticated actor from server middleware; never trust actor IDs from request bodies. Trigger audit context, if connection-scoped, must be set and cleared on the same acquired connection to avoid actor leakage through pooling.

Views support customer/account summaries, transaction history, employee/payroll summaries, branch totals, and monthly payroll. Queries demonstrate joins, aggregates, HAVING, subqueries, CTEs, and EXPLAIN with legitimate reporting cases. Triggers protect immutable history and audit selected changes; they do not also update balances. Separate migration-owner privileges from runtime privileges; test stored program security under the runtime user.

## 4. Security, API, and user experience

Use opaque session cookies (HttpOnly, Secure in deployment, SameSite), server-side expiration and logout, password hashing, CSRF tokens and origin checks for mutations, explicit CORS rules, and durable login throttling. Zod validates all inputs; queries use parameters and whitelisted sorting columns. Redact credentials and salary details from ordinary logs; return safe structured errors with request IDs.

Permissions are action-specific, including view/create/update/approve/process/export/administer. Administrator has explicit administrative grants. Banking Staff manages permitted customer/account/transaction operations; Payroll Manager manages employees and payroll; Read-Only Auditor has explicitly allowed read/export scope only. Server middleware enforces every action and sensitive field scope. Prohibit self-approval of payroll; use distinct authorized preparer and approver identities, including in seeds. Public registration is out of scope.

API prefix `/api/v1`: auth, customers, accounts, transactions, employees, payroll, branches, dashboard, reports, users, roles, audit logs, settings. Use server pagination, validated date filters, stable ordering, and consistent error and pagination envelopes. Separate liveness from database readiness; neither returns credentials or database internals.

Proposed brand: **Ledgerline — Banking & Payroll**. Deep navy, neutral white surfaces, muted teal, clear type hierarchy, subtle borders, and restrained animation. Responsive sidebar and page layouts; semantic controls, focus states, accessible dialogs and labels. No fabricated certifications or partnerships. Fictional marketing previews are clearly labeled; live dashboards never substitute invented totals for failed APIs.

## 5. Intended final structure

Only create files when their phase needs them; this is not a request to generate empty stubs.

```text
D:/DBMS/
  api/index.ts                    # Vercel Express adapter
  client/
    index.html, package.json, vite.config.ts, tsconfig.json
    src/
      main.tsx, App.tsx, styles.css
      components/ui/, components/landing/, layouts/, pages/
      features/{dashboard,customers,accounts,transactions,employees,
                payroll,branches,reports,administration}/
      hooks/, services/, schemas/, types/, utils/
  server/
    package.json, tsconfig.json
    src/
      app.ts, local.ts
      config/, routes/, controllers/, services/, repositories/
      middleware/, validators/, utils/
    tests/{integration,unit}/
  shared/
    package.json, src/{contracts,schemas}/
  database/
    migrations/, seeds/, tests/, reports/
    migrate.ts, seed.ts, verification.sql
  docs/
    IMPLEMENTATION_PLAN.md, PROJECT_STATUS.md, DBMS_FEATURE_CHECKLIST.md
    ARCHITECTURE.md, DATABASE_DESIGN.md, API_DOCUMENTATION.md
    SECURITY.md, VERCEL_DEPLOYMENT.md, DEMO_CHECKLIST.md
  package.json, package-lock.json, tsconfig.base.json
  eslint.config.js, .prettierrc.json, .gitignore, .env.example
  vercel.json, README.md
```

## 6. Phased execution and acceptance gates

Each phase starts with scope, file list, prerequisites, and acceptance criteria. Each ends with executed commands, actual results, untested areas, blockers, manual checks, updated status, and an explicit approval checkpoint.

| Phase | Deliverable and main files | Verification gate |
| --- | --- | --- |
| 0 | Environment inspection, this plan, status and DBMS checklist | Findings and Vercel constraints recorded; no application claims |
| 1 | Design system, complete landing page, login interface, dashboard shell, routes, frontend/Vercel config | Build/type checks, responsive and keyboard review, functional links, labeled incomplete modules |
| 2 | Migrations, core/supporting tables, seeds, ER diagram, database setup docs | Clean initialization on MySQL, constraints/FKs verified, migration rerun safety and seed separation |
| 3 | Views, routines, function, triggers, report SQL, indexes and SQL tests | Real database rollback, concurrency, duplicate, actor and privilege tests; EXPLAIN evidence |
| 4 | Express foundation, mysql2, auth, sessions, RBAC, errors, API adapter | Supertest against MySQL; unauthorized/forbidden, CSRF, expiry/logout and readiness failures; Vercel route smoke checks |
| 5 | Customers, accounts, branches, shared tables/forms and API modules | Validated CRUD/search/pagination/status changes; preserved history and role checks |
| 6 | Deposit, withdrawal, transfer, reversals and transaction history | Concurrent withdrawals/transfers, idempotency mismatch, invalid/inactive accounts, injected failure and verified balance conservation |
| 7 | Employee UI/API, payroll calculations, submit/approve/reject/process | Formula correctness, permissions, self-approval block, duplicate period/process and audit verification |
| 8 | Actual dashboard APIs, charts, date filters and activity feeds | Empty/partial/large datasets, aggregate reconciliation, loading/error states; no fabricated fallback data |
| 9 | Reports, exports, users/roles, audit browser and settings | Access checks, accurate filters/export totals, CSV formula-injection protection and audit visibility |
| 10 | Integrated QA and Vercel staging verification | Routes, forms, sessions, routine privileges, financial concurrency, responsive review and build/test suite |
| 11 | Reproducible setup, deployment, API/SQL/ER docs and demo checklist | Fresh environment reproduction, final checklist with evidence and limitations |

Phase 3 tests SQL routines directly before the HTTP layer exists. Phase 5 account creation requires a valid employee relationship: use seeded employees until Phase 7 supplies employee management. Phases 6 and 7 reuse previously verified routines and add end-to-end API tests.

## 7. Exact Phase 1 scope and anticipated files

Create root `package.json`, `package-lock.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.gitignore`, `.env.example`, `vercel.json`, and `README.md`.

Create `client/package.json`, `client/index.html`, `client/vite.config.ts`, `client/tsconfig.json`, `client/src/vite-env.d.ts`, `client/src/main.tsx`, `client/src/App.tsx`, and `client/src/styles.css`.

Create `client/src/components/ui/{Button,Card,Badge,Input}.tsx`, `client/src/components/Brand.tsx`, `client/src/components/landing/{Navigation,Hero,DashboardPreview,Features,Workflow,Faq,Footer}.tsx`, `client/src/layouts/AppLayout.tsx`, and `client/src/pages/{LandingPage,LoginPage,DashboardPreviewPage,ModuleStatusPage,NotFoundPage}.tsx`. Update this plan and `docs/PROJECT_STATUS.md` if verified implementation choices change.

Routes: `/`, `/login`, `/app`, and `/app/{customers,accounts,transactions,employees,payroll,branches,reports,users,audit-logs,settings}`. Every module opens a meaningful page explicitly describing its development status. The preview shell is public fictional UI in Phase 1; it is not authenticated functionality. Login clearly states authentication arrives in Phase 4 and does not accept or simulate successful credentials. Primary CTA opens `/login`; a separate labeled preview link opens `/app`. Feature and footer anchors resolve.

Phase 1 acceptance:
1. Landing page contains navigation/brand, hero, two CTAs, labeled product preview, banking/payroll/transaction/reporting/security sections, workflow, FAQ, and footer.
2. Navy/white/teal design is consistent across landing, login, and shell. No claims of implemented security mechanisms merely because they are planned.
3. All routes and controls work within their stated preview scope; no fake authentication, silent buttons, or fabricated live database figures.
4. Desktop, tablet, and mobile layouts are reviewed, including approximately 1440, 768, and 390px widths; no horizontal overflow. Keyboard navigation, focus, reduced motion, labels, and FAQ behavior checked.
5. `npm run typecheck`, `npm run lint`, and `npm run build` pass. Report browser review limitations if tools cannot run; do not claim unperformed checks.
6. Vercel static output and SPA fallback are configured; direct nested route reload is verified locally and later on an actual preview deployment. Local build success alone does not establish deployment success.
7. README lists exact install/run/build steps and the explicit Phase 1 limitations. Status records verified results and next phase.

## 8. Prerequisites and risks

Phase 1: approval, npm registry access, compatible package versions. No database credentials needed yet.

Phase 2: local MySQL login with permission to create the named database and migration/runtime users. Keep secrets in ignored local env files; do not paste passwords into tracked files or command arguments. Confirm server SQL mode, version, grants and routine restrictions before migrating. Use an isolated test database for destructive fixtures.

Before deployment: hosted MySQL connection details and verified TLS CA configuration; compatible stored-program grants; Vercel project/account access and environment settings; preview database separation. A running laptop service is not a deployment database. Missing Docker or global Vercel CLI does not block Git-based deployment.

Main risks: managed MySQL routine restrictions, function/database connection budgets, API rewrite precedence, MySQL DDL implicit commits, pooled actor context, and payroll/transfer retries. Track all with explicit verification; do not mask an unavailable database with mock success. Large payroll runs must be bounded to function execution limits, with resumable per-record idempotency instead of an unbounded request.

## 9. Commands and manual review

Available now (read-only):
```powershell
Set-Location D:\DBMS
Get-Content .\docs\IMPLEMENTATION_PLAN.md
Get-Service MySQL80
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' --version
```

After Phase 1 implementation, these npm scripts will be supplied (they do not exist yet): `npm ci`, `npm run dev`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run preview`.

Review the stack, Vercel/external-MySQL split, proposed brand, first-phase scope and acceptance criteria before approving Phase 1. No application test is possible in Phase 0 because application code has not been created.

## Phase 2 completion — 11 October 2026

The approved additive legacy upgrade has been applied and verified. Both migration tracks converge on modern payroll_records and provenance/opening-snapshot tables. All 61 legacy rows, five views and two source triggers remain preserved. Twenty-four baseline tests, five import failure rollbacks and upgrade safeguards passed. See PROJECT_STATUS.md and LEGACY_UPGRADE_EVIDENCE.json. Phase 3 awaits approval. Earlier environment/database observations above describe Phase 0 and are superseded by the current status.

## Requested Phases 4 and 5 — 12 October 2026

The user explicitly authorized both phases together, so the checkpoint between 4 and 5 was superseded for this request. Implementation and local tests are complete; see PHASE_4_5_PLAN.md and PHASE_4_5_VERIFICATION.md. Phase 3 remains unimplemented. Record management uses direct parameterized joins and Phase 2 safeguards; it does not expose incomplete money/payroll operations. The next recommended dependency is Phase 3 before Phase 6.
