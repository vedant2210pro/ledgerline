# Phases 8 and 9 plan

Authorized together by the user's request to start the next phases.

1. Add permission-scoped live dashboard metrics, date-filtered banking/payroll trends, recent activity and clear empty/error states. Current balances are labelled as current, not historical balances.
2. Add banking, payroll, account/reconciliation and branch reports with validated dates/search/status, pagination and authorized CSV export. Preserve exact decimal strings and neutralize spreadsheet formulas in text cells.
3. Add user creation, fixed-role assignment, account status management and password reset with safe audit events, version checks, immediate session revocation and protection against losing administrator access. Add paginated audit browsing and a read-only system-information screen.
4. Test aggregates against fixture data, permission separation, empty ranges, exports, admin races/constraints and UI loading/error states. Preserve original records and back up before the forward schema migration.
5. Verify build and local connectivity; provide local app, MySQL Workbench/ER diagram and Vercel connection instructions. Hosting remains separate from local configuration.
