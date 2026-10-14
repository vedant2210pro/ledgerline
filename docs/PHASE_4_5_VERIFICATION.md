# Phases 4 and 5 verification

Completed local implementation on 12 October 2026 (Asia/Kolkata). The user explicitly requested both phases together; Phase 3 remained deferred.

## Implemented

Express 5, strict shared Zod contracts, mysql2 pooling, opaque sessions, scrypt password hashes, server permissions, origin/CSRF checks, durable throttling, safe errors and health endpoints. Local setup generated a restricted runtime user and the requested administrator, with password only in ignored .env.admin.json.

Customer/account/branch routes and React forms support list/search/status filters/pagination, details, creation, edit and permitted status transitions. Entity mutation and actor-attributed audit logging share one transaction. Row versions reject stale writes. Runtime SQL privileges prevent arbitrary balances, history edits and deletes. Protected workspace routes show live records; fictional analytics stay at /preview.

Migration 009 exists identically in both immutable tracks. It adds login_throttles, three entity row_version columns and audit HTTP request correlation. Before application, the existing database was backed up to `database/backups/phase45-20261012135154125/legacy.sql` with its SHA-256. The six original tables, 61 rows, five views and original triggers remain unchanged.

## Executed verification

| Check | Observed result |
| --- | --- |
| npm run app:setup | Local backup, additive migration, restricted grants and administrator provisioning completed |
| npm run api:test | 16 integration tests passed against actual MySQL with the restricted runtime login |
| npm run db:test | 24 real MySQL schema tests passed |
| npm run ui:test | 9 component tests passed in jsdom; API responses mocked only in this UI suite |
| npm run typecheck / npm run lint / npm run build | Passed; all workspaces and frontend build checked |
| npm run db:verify | 29 tables, 8 upgrade migrations, 35 FKs, 51 CHECKs, 22 UNIQUE constraints |
| npm run db:upgrade:verify | 61 original rows, 40 mappings, 10 frozen accounts and 11 historical payroll reservations still verified |
| Combined npm run dev | API and Vite started; Vite proxy readiness, real configured admin login/me/logout and three ten-record lists passed |
| api/index.ts default export | Local HTTP liveness smoke passed; no cloud routing claim |
| Built frontend credential scan | No administrative/runtime password, AUTH_SECRET or bootstrap password found in public assets |

The API suite covers unauthorized/forbidden access, safe invalid-credential responses, hashed tokens, development/production cookie attributes, invalid JSON, origin/content-type/CSRF rejection, unavailable DB readiness, role-aware lookups, real CRUD/search/pagination, duplicate/unknown fields, relationship/date validation, zero balances, closure/deactivation restrictions, frozen imports, stale concurrent updates, audit failure rollback, column/table grant denials, role removal, disabled users, expiry/logout/rotation and parallel login throttling. Test records are tagged and cleaned only from banking_payroll_test; source business records are not test fixtures.

The component suite uses real shared validators and tests login validation, protected routing/retry, record search/pagination, empty/error states, permission controls, customer creation/navigation, relationship lookup/account payloads, confirmation/stale-edit feedback and imported-account/read-only notices. These are isolated component checks, not browser screenshots or a mock substitute for database verification.

## Resolved issues and limitations

A first runtime login exposed an overly strong row-lock request under SELECT-only user grants; it now uses a shared lock for the final credential/status check. API tests then passed under the restricted account. Formatter/lint/type issues were corrected. The build reports two harmless upstream Zod comment-annotation warnings; Rollup removes those comments and finishes successfully.

The browser tool rejected access to the local preview under its URL policy. No alternate browser or browser-policy workaround was used. Interactive layout/responsive/keyboard QA remains unverified and requires manual review. This session did not run a cloud deployment, cloud TLS check, Vercel end-to-end test, full security audit or production load test.

Phase 3 financial routines, opening-balance review, deposit/withdrawal/transfer, payroll, reporting, employee management and user administration remain pending. No known blocker remains for local Phase 4/5 operation. These limitations are not represented as completed banking/payment features.

## Manual review

Run npm run dev, open /login, read the ignored local sign-in file, and sign in. Create a clearly fictional customer and zero-balance account, inspect its linked records, edit contact fields, freeze/close the zero-balance account, then deactivate the customer. Test branch changes, filters and pagination. Imported accounts must remain frozen. Sign out and confirm /app/customers redirects to login. Check phone/tablet/desktop widths and keyboard focus; any records created in the application remain auditable real local records.
