# MySQL setup and verification

## Current machine

Local MySQL 8.0.43 is configured through the ignored root `.env`. These administrative credentials stay local; the frontend never reads them. A separate least-privilege runtime identity remains later work.

**banking_payroll_db has completed its approved legacy upgrade.** Use `db:verify` and `db:upgrade:verify`. The clean-install runner still refuses to adopt its separate migration history; fictional seeding is blocked there. `db:test` uses only banking_payroll_test.

## Another clean installation

Use Node 24.x, npm and MySQL 8.0.16+ in the MySQL 8 family. Copy `.env.example` to `.env` and enter local credentials without committing or logging the file. CLI scripts use Node native TypeScript and mysql2.

```powershell
npm ci
npm run db:check
npm run db:test
# Only when the configured application schema is absent or empty:
npm run db:init
npm run db:verify
# Optional fictional seed on a clean development schema only:
npm run db:seed
```

The migration identity needs schema creation plus SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES and TRIGGER on the development schemas. Backup/restoration needs access to source definitions/views/triggers, LOCK TABLES and permission to create isolated rehearsal schemas. Existing local administrative credentials were used for this approved upgrade. Future routine/EXECUTE grants and runtime restrictions will be tested separately.

Local defaults are 127.0.0.1:3306 and banking_payroll_db. Remote application connections require verified TLS (`MYSQL_SSL=true`, optional trusted CA path). Never copy local root credentials into Vercel.

## Two migration tracks

Clean installs apply `database/migrations/001..008`. Migration 007 renames the modern payroll table to payroll_records; 008 adds provenance, opening snapshots, historical payroll reservations and four narrowly scoped guards. The first six files remain immutable. Seed source/checksum also remain immutable; the runner adapts its payroll table identifier to the forward rename.

Legacy upgrades use `database/upgrade/migrations/` with `legacy_upgrade_migrations` metadata. They create modern tables alongside the six source tables. The new definitions and role grants were compared against the clean installation. Source payroll is never renamed.

```powershell
# One-time commands for the reviewed original six-table source only:
npm run db:upgrade:rehearse
npm run db:upgrade:apply
# Current state, read-only verification:
npm run db:verify
npm run db:upgrade:verify
```

The one-time runner validates the reviewed source shape/counts, aborts for active legacy queries, obtains source READ locks, creates a private dump, restores it to a new timestamped schema, tests atomic import/guards/convergence, and only then applies when mode is apply. Run db:test first to prepare the canonical comparison schema. The runner uses the installed MySQL tools under `C:/Program Files/MySQL/MySQL Server 8.0/bin/` and is deliberately limited to the approved loopback server.

After an upgrade has started or completed, the outer runner refuses to automatically redo it. The internal import is idempotent and was retried successfully on both rehearsal and application schemas. For future rehearsals, restore the retained pre-upgrade dump into another reviewed isolated schema; never reset the source to rerun a test.

## Recovery and evidence

Final pre-upgrade dump: `database/backups/20261011120536420/legacy.sql`; its checksum and restoration evidence are in `docs/LEGACY_UPGRADE_EVIDENCE.json`. Backups contain original records and are ignored. The dump was restored to `banking_payroll_rehearsal_20261011120536420`, which remains available locally. Earlier candidates are retained but superseded. Credentials are passed to the MySQL child process through its environment, not arguments or output.

Migrations use advisory locks, SHA-256 checksums and running/applied/failed markers. Applied files must not be edited. MySQL DDL is not transactional; a failure may leave additive objects. Inspect those objects and markers against the verified restore before a corrective migration. Never blindly delete migration metadata, disable FK checks or restore an old dump over later financial activity. Import inserts and provenance are one transaction; five injected failures demonstrated rollback.

Verification compares source hashes/definitions with the import batch, exact copied fields and balances, provenance counts, pending frozen-account snapshots and payroll reservations. This is a cutover-state check; ongoing reconciliation after legitimate future mutations belongs to later phases.

Source READ locks were released after verification. Existing administrative privileges were preserved. Future runtime credentials must receive SELECT-only rights on historical source tables. Root can still alter data today; these schemas are not exposed through a banking API.

## Deployment boundary

Vercel configuration still builds the frontend preview. A separately hosted MySQL database, API and restricted server-side credentials remain necessary for the completed system. Run migrations from a trusted administrative environment, never from the frontend build or a function cold start. Keep preview and production databases/credentials separate. No cloud deployment was performed in Phase 2.

## Phases 4 and 5 update — 12 October 2026

The user requested both phases together. They now provide the real authenticated API and record-management UI described in PHASE_4_5_VERIFICATION.md. This overrides the earlier current-state note about an unconnected frontend. Phase 3 remains deferred; no financial procedures were added.

To start on this machine, run `npm run dev`. The API uses MYSQL_RUNTIME_USER/MYSQL_RUNTIME_PASSWORD, while administration retains MYSQL_USER/MYSQL_PASSWORD. The generated initial application login is in ignored .env.admin.json. Local `npm run app:setup` applies the necessary forward migration to either known track, provisions only its generated restricted account, and preserves existing matching application credentials. It requires local administrative CREATE USER/GRANT privileges. Fresh installations must first run db:init on an empty schema; unrelated nonempty schemas are never auto-adopted.

Migration 009 adds durable login counters, entity row versions and audit HTTP correlation. The source schema now has 29 tables (including six source tables); the clean test schema has 23. Runtime grants are column-scoped for sensitive account operations and absent on source history/payroll. Do not reuse this local development account across cloud environments.

A pre-change backup and SHA-256 are in database/backups/phase45-20261012135154125/. Root environment files, bootstrap credentials and backups stay local. Expired auth metadata can be cleaned in bounded batches with npm run auth:cleanup; the API user cannot perform these deletes. Read SECURITY.md and VERCEL_DEPLOYMENT.md before hosting.

## Current financial setup

`npm run app:setup` applies the new forward migrations to the appropriate existing track, creates an ignored backup before pending legacy-track migrations, checks unchanged source digests and provisions the public financial routine grants in `server/scripts/grants.ts`. Do not manually replace an applied SQL file: add a new migration.

Run `npm run db:verify:financial` after setup. This checks the nine routines and six modern views and reconciles all balances. Tests use only banking_payroll_test; their committed financial fixture history is deliberately retained and their temporary users disabled. The main database retains the original frozen accounts with no synthetic deposits or payroll inserted by tests.

Employee completion requires real designation and joining date values. Independent payroll approval requires another authorized active application user; the MySQL root login is not an application reviewer. User administration screens are the later Phase 9 scope.
