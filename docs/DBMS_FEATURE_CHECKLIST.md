# DBMS feature checklist

Current evidence: 13 October 2026. Historical Phase 2/4/5 verification is retained in their dedicated documents.

| Feature | Implementation and verification |
|---|---|
| Tables, keys, CHECK, exact DECIMAL | 24 schema tests; 29 main/23 clean base tables; 35 main FKs and 51 checks |
| CRUD and joins | Authenticated customer/account/branch/employee APIs and payroll workflows; 32 real-MySQL API tests |
| INNER and LEFT JOIN | Entity relationships, transaction history and employee/customer views |
| RIGHT JOIN | v_branch_activity retains branches without postings |
| GROUP BY, HAVING, aggregates | Monthly payroll/branch views; reporting queries in database/reports.ts |
| Subqueries and CTEs | Above-average balances, per-record links and department payroll queries; EXPLAIN runs against MySQL |
| Views | Six modern INVOKER views plus five separately preserved legacy views |
| Triggers / OLD / NEW | Four provenance guards plus ten posted-history protections; rollback/immutability tested |
| Stored procedures | Five public transaction/payroll procedures; three ungranted private helpers |
| Stored function | calculate_net_salary; exact cents preview and invalid-component tests |
| Transactions / rollback | Procedure-owned atomic financial calls and server-owned record/workflow transactions; injected audit failures |
| Locking / concurrency | Ascending account locks, request uniqueness, payload fingerprint, bounded same-key retries; competing withdrawals/transfers/deposits |
| EXPLAIN / indexes | Account/date, branch/date, transfer-leg and entity/audit indexes; actual plan evidence from db:verify:financial |
| ORDER BY / LIMIT / CASE / date / NULL | Stable paginated lists, signed ledger reconciliation, period/date reporting, zero-safe aggregates |
| Runtime privileges | Direct balance/history/processing-reference writes and helper execution denied; public calls tested under the generated runtime user |
| Cursors / events | Not needed; set-based queries and explicitly authorized processing avoid unattended mutations |

`npm run db:verify:financial` checks routine/view inventory, reconciles every main account and prints privacy-safe optimizer metadata. `node database/verify-financial.ts --test` checks fictional committed test history. Production-sized performance remains unmeasured; aggregate full scans on small tables are documented rather than hidden.

Main legacy source preservation remains verified at the original 61-row digest. No legacy transactions are replayed into balances; opening snapshots plus modern signed movements are the reconciliation basis. See PHASE_6_7_VERIFICATION.md and PROJECT_STATUS.md.
