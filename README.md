# Ledgerline — Banking & Payroll Management System

A full-stack academic DBMS project for managing customers, bank accounts, branches, employees, banking transactions and payroll with role-based access and an auditable history.

**Application:** [ledgerline-lime.vercel.app](https://ledgerline-lime.vercel.app)

> Ledgerline is an academic demonstration. It records internal transactions and payroll workflow; it does not connect to real banking rails or send salary payments. Access requires an administrator-provisioned account. No public credentials are included in this repository.

## Features

- **Dashboard:** permission-scoped banking and payroll summaries, charts and date filters.
- **Customers:** create, search, update and deactivate customer records with relationship checks.
- **Accounts:** open zero-balance accounts, assign officers, inspect balances, freeze accounts and close eligible zero-balance accounts.
- **Opening-balance review:** compare imported source balances and ledger reconciliation, record administrator review evidence and separately activate accounts.
- **Banking:** deposits, withdrawals, atomic transfers, reference receipts and controlled compensating reversals.
- **Employees:** maintain employment details and payroll eligibility.
- **Payroll:** draft, calculate, submit, independently approve/reject and process payroll records; view summaries and audit history.
- **Reports:** filtered banking, account, branch and payroll reports with permission-controlled CSV exports.
- **User administration:** create users, assign fixed roles, disable access and reset passwords.
- **Audit history:** actor-attributed changes with timestamps and before/after values.
- **Legacy preservation:** retain original records and imported opening balances without replaying historical transactions.

## Roles and permissions

Users can hold multiple roles; their permissions combine.

| Role | Main responsibilities |
| --- | --- |
| Administrator | Manage users and records, review imported balances, perform authorized banking/payroll operations, reverse eligible transactions and inspect audit/settings data |
| Banking Staff | Manage customers/accounts, perform deposits, withdrawals and transfers, and view banking reports |
| Payroll Manager | Manage employees and payroll, approve another preparer's payroll, and view payroll reports |
| Auditor | Read permitted banking/payroll records, inspect audit history and export reports; no business-record writes |

Payroll approval requires a different authorized person from the preparer, including when an administrator prepares the record. There is no customer-login or employee self-service portal.

See the [complete feature and role guide](docs/COLLEAGUE_GUIDE.md).

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS and custom CSS |
| Backend | Node.js 24, Express 5, TypeScript |
| Validation | Shared Zod schemas |
| Database | MySQL 8, InnoDB, mysql2 connection pool |
| Authentication | Scrypt password hashes, opaque database-backed sessions, HttpOnly cookies |
| Tests | Node test runner, Supertest, Vitest, React Testing Library |
| Hosting | Vercel frontend/API with a separately hosted MySQL database; current deployment uses Aiven |

## Architecture

```text
Browser (React)
      |
      | HTTPS /api/v1/*
      v
Express API (Vercel Node function)
      |
      | Restricted database identity + verified TLS
      v
MySQL 8
  Records / sessions / roles / audit logs
  Stored routines / reporting views / integrity triggers
```

During local development, Vite runs on port 5173 and proxies API requests to Express on port 3001. The production build bundles the backend into `server/dist/runtime.mjs`, exported by `api/index.js`.

## Database concepts demonstrated

- Relational entities, primary keys, foreign keys, unique constraints and enforced CHECK constraints.
- Transactions and row locking for financial consistency under concurrent requests.
- Exact monetary values using MySQL DECIMAL and integer-cent calculations.
- Stored procedures, a salary-calculation function, triggers and reporting views.
- Indexed queries, joins, grouping, subqueries, CTEs and EXPLAIN analysis.
- Separate administrative and restricted runtime database identities.
- Audit records committed atomically with business changes.
- Import provenance and reconciliation:

```text
Current account balance = imported opening balance + signed modern ledger movements
```

Transfers post both sides together. Reversals create compensating entries instead of rewriting posted history. Repeated financial requests use idempotency keys to avoid duplicate postings.

## Local installation

### Prerequisites

- Node.js **24.x** and npm.
- MySQL **8.0.16 or newer within the MySQL 8 family**.
- A local administrative database identity permitted to create the development schemas and restricted application user.

### Fresh development database

Clone or download the repository, open its root folder and run:

```powershell
npm ci
Copy-Item .env.example .env
```

Edit `.env` locally. Set `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `BOOTSTRAP_EMAIL` and `BOOTSTRAP_NAME`. Keep secrets out of Git.

For an absent or empty application database:

```powershell
npm run db:init
npm run app:setup
npm run dev
```

Open [http://127.0.0.1:5173/login](http://127.0.0.1:5173/login).

`app:setup` provisions a restricted local runtime identity and the first application administrator. Newly generated administrator credentials are written to the ignored `.env.admin.json` file. Existing identities are reused; setup is not a password-reset command. Application login credentials are separate from MySQL credentials.

**Existing database:** do not run clean initialization over existing data. Follow the [MySQL setup guide](docs/MYSQL_SETUP.md) and [legacy upgrade plan](docs/LEGACY_UPGRADE_PLAN.md). Already configured installations can start with `npm run dev`.

## Account activation and transactions

New accounts start at zero balance. Imported accounts can remain frozen until their opening balances have been reviewed.

For an individual imported account:

1. Sign in as an administrator and open the account details.
2. Compare the original source, opening balance and reconciliation in **Opening balance review**.
3. Confirm the comparison, add a meaningful note and submit the review.
4. Set the account status to **active** and save the account form.

Both accounts must be active for a transfer. Withdrawals require sufficient funds. Closed accounts cannot reopen, and balances cannot be overwritten through the record-edit form.

For the existing academic deployment, an owner-requested, checked bulk-activation script and instructions are provided in the [activation guide](docs/ACTIVATE_ACCOUNTS_GUIDE.md). This is an explicit administrative operation, not a setup or deployment step. It preserves balances and records audit evidence. Read its target schema and administrator identity before running it against another installation.

## Deploying to Vercel

The repository includes `vercel.json` with these settings:

| Setting | Value |
| --- | --- |
| Root directory | Repository root |
| Node.js | 24.x |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `client/dist` |
| API entry | `api/index.js` |

Provision MySQL separately, apply the appropriate schema and runtime grants, and configure these **server-side** environment variables:

| Variable | Purpose |
| --- | --- |
| `MYSQL_HOST`, `MYSQL_PORT` | Hosted database connection |
| `MYSQL_DATABASE` | Application schema |
| `MYSQL_RUNTIME_USER`, `MYSQL_RUNTIME_PASSWORD` | Restricted API database identity |
| `MYSQL_SSL` | `true` for remote connections |
| `MYSQL_SSL_CA` | Deployed CA certificate path when required |
| `AUTH_SECRET` | Secret containing at least 32 random bytes, encoded to at least 43 characters |
| `APP_ORIGIN` | Exact website origin, such as `https://your-project.vercel.app`, without a trailing slash |
| `NODE_ENV` | `production` |

Keep credentials server-side; never prefix them with `VITE_`. Do not upload `.env`, `.env.admin.json` or database backups. Use the correct CA certificate for your database provider. Schema migrations do not run automatically during builds or requests.

Follow the [deployment guide](docs/VERCEL_DEPLOYMENT.md) and verify:

- `/api/v1/health/live` — API process responds.
- `/api/v1/health/ready` — database readiness succeeds.
- Login, authorized record access, account review and transaction workflows.

The repository may contain changes newer than the currently deployed version; a successful local build does not establish hosted acceptance.

## Testing and verification

```powershell
npm run db:test
npm run api:test
npm run ui:test
npm run lint
npm run build
npm run db:verify:financial
```

Database/API tests require the configured local MySQL setup and use `banking_payroll_test`. They retain committed fictional financial history in that test schema. Do not substitute the live database for the test schema.

The 15 October 2026 full verification checkpoint passed **24 schema tests, 55 API tests and 35 UI tests**. The subsequent activation update passed **all 7 opening-review backend tests**, including its new bulk-activation regression, and **all 35 UI tests**, plus lint, type checks and the production build. These are recorded checkpoints rather than a claim that the full suite was rerun after every documentation change.

Manual responsive/browser acceptance and hosted verification of the latest updates remain outstanding. See [verification evidence](docs/FINAL_AUDIT_2026_10_15.md).

## Security and integrity

- Passwords are salted and hashed with scrypt; plaintext passwords are not stored in application user records.
- Session tokens are hashed in MySQL; production cookies are Secure and HttpOnly.
- Mutations require trusted-origin and CSRF checks, authentication and relevant permissions.
- Shared validation, parameterized SQL and server-side authorization protect API boundaries.
- Optimistic record versions detect stale edits; audit failures roll back their associated mutations.
- Runtime database privileges restrict direct balance and financial-history changes.

This project is not a certified production banking platform. MFA, public registration, email-based account recovery and external payment execution are outside its implemented scope. See [security boundaries](docs/SECURITY.md).

## Repository structure

```text
client/       React pages, components, authentication and UI tests
server/       Express API, administrative scripts and API tests
shared/       Shared validation schemas and TypeScript contracts
database/     Migrations, legacy upgrade, reports and schema tests
api/          Vercel API adapter
scripts/      Development startup and backend build tools
certs/        Database CA certificate bundled for deployment
docs/         Design, deployment, SQL operations and lab guides
```

## Documentation

- [Lab instructor explanation and demonstration](docs/LAB_INSTRUCTOR_GUIDE.md)
- [Roles and feature walkthrough](docs/COLLEAGUE_GUIDE.md)
- [Database design](docs/DATABASE_DESIGN.md)
- [API documentation](docs/API_DOCUMENTATION.md)
- [Workbench connection and visualization](docs/CONNECT_AND_VISUALIZE.md)
- [Vercel deployment](docs/VERCEL_DEPLOYMENT.md)
- [Account activation](docs/ACTIVATE_ACCOUNTS_GUIDE.md)
- [Project status](docs/PROJECT_STATUS.md)
