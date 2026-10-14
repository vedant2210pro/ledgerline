# Phases 8 and 9 verification

Verified locally on 13 October 2026.

## Delivered

- Permission-scoped live dashboard, exact decimal totals, dated charts, accessible value tables and recent activity.
- Four paginated report types with validated filters and independently authorized CSV exports, formula neutralization, a 5,000-row limit and export audit entries.
- User creation, fixed-role assignment, status changes and password resets. Passwords are hashed and omitted from responses/audits. Changes revoke sessions and use optimistic versions.
- Serialized administrative writes protect the last active administrator, recheck actor authority and release their database advisory lock after failure. Self-disable and self-removal of administrator access are blocked.
- Searchable audit browsing and read-only operating settings/reconciliation.

## Automated evidence

92 tests passed: 24 MySQL schema tests, 46 real-MySQL API tests and 22 React/jsdom component tests. New coverage checks permission isolation, aggregates against SQL, empty/invalid dates, report pagination, export permissions/escaping/auditing, user validation, session revocation, concurrent stale edits, concurrent administrator demotions, password resets and audit-failure rollback. UI checks cover exact large amounts, errors/empty states, filters, export failure and review-before-create behavior.

Lint, all TypeScript workspaces and the production build passed. The build reports two upstream Zod annotation warnings; output was generated successfully.

## Preservation

Migration 013 adds `users.row_version` on both immutable migration tracks. Local setup saved `database/backups/forward-20261013043946354/legacy.sql` before upgrading and reused the existing administrator. Main now has 29 tables and 12 upgrade migrations; the clean test track has 13 migrations.

All 61 original rows, five legacy views and two legacy triggers remain intact. Inventory digest remains `ddf2ae493a6f1dcaff3854ea41e796f45aab56ac634da80dfde659283d5c77a0`. Main schema, legacy preservation and balance reconciliation checks passed. Main business counts remain ten customers, ten employees, ten accounts, zero new postings and zero new payroll records. No production data was seeded for charts.

## Limits

React/jsdom tests do not establish visual quality. Interactive browser/responsive review remains outstanding because the browser tool rejected local-page access. No hosted Vercel deployment, hosted TLS verification, load benchmark or production security certification is claimed. Account activation, employment-data review and a real independent payroll reviewer remain operational steps.

See [connection instructions](CONNECT_AND_VISUALIZE.md), [implementation plan](PHASE_8_9_PLAN.md) and [deployment guide](VERCEL_DEPLOYMENT.md).

Authenticated main-database smoke checks returned 200 for readiness, dashboard, all four reports, users, roles, audit logs and system information; login succeeded and JSON logout returned 204. Local Vite HTTP checks returned 200 for /, /login, /app/reports and proxied API readiness. No business writes were performed. The temporary development server was stopped after verification; run npm run dev to view the app.
