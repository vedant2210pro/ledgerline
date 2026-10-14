# Ledgerline — Banking & Payroll

A phased academic application using React, Vite, TypeScript, Tailwind, Express 5 and MySQL 8.

**Phases 3–9 are implemented:** authenticated customer/account/branch/employee records, atomic banking operations and reversals, payroll previews and independent approval/processing, payroll summaries and audit history. Existing legacy records and opening balances are preserved. Live dashboard analytics, filtered reports/CSV exports, user administration and audit browsing are now available. This academic application does not execute external payments.

## Run on this configured machine

```powershell
npm run dev
```

Open `http://127.0.0.1:5173/login`. The command starts Vite on 5173 and the local API on 3001. Vite proxies `/api` to Express. Ctrl+C stops both. Frontend edits reload automatically; restart this combined command after server edits, or use `npm run dev:server` separately for backend watch mode.

Your administrator identity is configured. **Read `.env.admin.json` locally for its generated password.** The file and root `.env` are ignored by Git and Vercel uploads. Do not upload either file. MySQL root credentials are used only by setup/migration tools; API requests use a generated restricted account.

`/app` is protected. `/preview` remains a separate, clearly fictional dashboard illustration. No live financial totals are invented for the authenticated overview.

## New local installation

Use Node 24.x and MySQL 8.0.16+ in the MySQL 8 family. Run `npm ci`, copy `.env.example` to `.env`, set the administrative MySQL connection plus BOOTSTRAP_EMAIL and BOOTSTRAP_NAME. For an absent/empty application database, run `npm run db:init`, then `npm run app:setup`. Optional fictional seed data is opt-in on clean development databases; it is blocked on the preserved legacy application database. See [MySQL setup](docs/MYSQL_SETUP.md).

Do not run clean initialization over an existing unrelated database. This machine already completed its separately reviewed legacy upgrade; `app:setup` recognizes that migration track.

## Check the implementation

```powershell
npm run db:test
npm run api:test
npm run ui:test
npm run lint
npm run build
npm run db:verify
npm run db:upgrade:verify
npm run db:verify:financial
```

Executed results: 24 schema tests, 48 API tests (47 real-MySQL and one simulated readiness failure) and 22 React/jsdom component tests passed (94 total). Build, types, lint, main/test balance reconciliation, legacy preservation and authenticated main-database reads passed. Interactive visual/responsive review remains outstanding because the browser tool blocked local-page access. See [current verification](docs/PHASE_10_VERIFICATION.md).

The upgrade preservation verifier describes the initial cutover state: legitimate later edits to imported profiles/statuses will require ongoing reconciliation rather than expecting that exact-state check to keep passing.

See [Connect and visualize](docs/CONNECT_AND_VISUALIZE.md) for dashboard, MySQL Workbench and ER diagram instructions.

See [colleague roles and every feature](docs/COLLEAGUE_GUIDE.md) for a shareable team overview.

## What you can do

- Sign in, refresh a session and sign out with durable revocation.
- Search/filter/page through customers, accounts, branches and employees.
- Deposit, withdraw and transfer with review, idempotent receipts and searchable posting history; administrators can create compensating reversals.
- Prepare payroll, verify exact calculations, submit for independent approval, reject/correct drafts and process approved records.
- Read live dashboard charts, filtered reports, authorized CSV exports and searchable audit history.
- Create users, assign fixed roles and reset access through reviewed administrator actions.
- Read monthly payroll summaries and per-record audit history.
- Create records, view details and save edits with stale-update detection.
- Open accounts at zero balance with a selected customer/officer; freeze or close permitted accounts.
- Deactivate customers only after their accounts are closed; deactivate/reactivate branches.
- Inspect imported accounts while their opening balances remain frozen for review.

Account balances, owners, opening dates and account types cannot be rewritten through update requests. Closed accounts cannot reopen. No record-deletion endpoint is provided. Successful mutations and their audit entries commit together. Payroll needs a second active authorized reviewer; only your supplied administrator is provisioned on this machine. Imported employees require confirmed employment details before payroll.

## Vercel

The root `vercel.json` builds `client/dist` and routes `/api/*` to the Express adapter in `api/index.ts`. Keep the Vercel Root Directory at the repository root. Server-only environment variables and a reachable, separately hosted MySQL database are still required. **No cloud deployment has been performed.** See [Vercel instructions](docs/VERCEL_DEPLOYMENT.md).

## Main files

- `client/src/auth`, `services` and record/login pages: authenticated UI and typed API requests.
- `shared/src/index.ts`: strict shared Zod validation and TypeScript contracts.
- `server/src`: Express setup, configuration, pooled connections, authentication, permissions and record routes.
- `server/scripts`: administrative setup and bounded expired-auth metadata cleanup.
- `database`: immutable migration tracks, preserved legacy importer and real database tests.
- `api/index.ts`: Vercel default handler; `scripts/dev.mjs`: combined local startup.

Read [project status](docs/PROJECT_STATUS.md), [API contracts](docs/API_DOCUMENTATION.md), [security boundaries](docs/SECURITY.md) and [phase verification](docs/PHASE_10_VERIFICATION.md).
