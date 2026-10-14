# Phase 3, 6 and 7 verification

Date: 13 October 2026 (Asia/Kolkata).

## Database implementation

010 adds `calculate_net_salary`, private authorization/account-lock/operation helpers, and five public procedures: `sp_deposit_money`, `sp_withdraw_money`, `sp_transfer_money`, `sp_reverse_transaction`, `sp_process_payroll`.

Each financial call owns START TRANSACTION, COMMIT and a rollback/RESIGNAL handler. Account locks use ascending account IDs. Request identity is unique by actor, operation and key; a SHA-256 payload fingerprint detects reuse with changed inputs. Completed requests return the original reference. The API normalizes decimal amounts and retries up to three attempts only for known rolled-back deadlocks/lock timeouts, retaining the same key. Unknown outcomes require a same-key client retry.

011 adds immutable posted transaction/transfer, processed payroll, completed-request and financial-audit protections, plus six INVOKER views. Financial audit entries cannot be deleted even by ordinary administrative DELETE; nonfinancial audit deletion remains an administrative maintenance capability, never a runtime grant. No spoofable session variable bypass was introduced.

012 adds employee/payroll row versions, a transfer-leg lookup index and an entity/audit-history index. `database/reports.ts` verifies routine/view inventory, all-account reconciliation and EXPLAIN plans for representative reporting SQL. The account history query used the existing account/date index in test; aggregate scans remain expected for small datasets. Optional cursors/events were not needed.

The routine transaction/access model follows the [MySQL CREATE PROCEDURE documentation](https://dev.mysql.com/doc/refman/8.0/en/create-procedure.html). Public routines must be called on an autocommit connection without a surrounding application transaction. Helper procedures have no runtime EXECUTE grants. The trusted server derives actor IDs from authenticated sessions; database credentials must never be exposed to browsers.

## Executed tests

| Suite | Result | Evidence |
|---|---|---|
| MySQL schema | 24 passed | constraints, FK/unique/check behavior, seeds, migrations and checksum guards |
| Authentication/records API | 16 passed | permissions, CSRF, sessions, CRUD, stale writes, audit rollback |
| Banking/payroll API | 16 passed | actual restricted-runtime calls and post-operation MySQL assertions |
| React component UI | 15 passed | record forms, permissions, exact previews, independent approval, immutable processed view, same-key retry |
| Build / types / lint | passed | production assets and strict TypeScript checks |
| Main schema / source preservation | passed | 61 original rows, 5 views and 2 triggers retain the original digest |
| Main/test reconciliation | passed | opening balance + signed ledger movements equals each account balance |
| Authenticated main smoke | passed | readiness, login, 4 read endpoints, logout; no business mutations |

Banking/payroll integration cases: invalid precision/negative/zero amounts; forbidden roles and missing CSRF; concurrent duplicate deposits; payload conflicts; competing withdrawals; opposite transfers; pairwise reversals, repeated and unauthorized reversal; frozen accounts/inactive branches; injected audit rollback with same-key retry; immutable history/direct-write denials; employee stale writes/deactivation; exact salary arithmetic; duplicate and legacy-reserved periods; submit/approve/process; own-payroll review rejection; rejected-draft correction; processing rollback; inactive employee/revoked reviewer; direct routine authorization.

Fictional committed financial fixtures remain in the isolated test database to honor the immutable history model. Their users are disabled after each test run. Tests do not perform business operations in the user's main database.

## Main database migration

`app:setup` saved the ignored pre-change backup under `database/backups/forward-20261012190106575`, applied the forward migration track and checked before/after source digests. It granted the generated runtime account only required employee/payroll columns, read access and public routine execution. Balance updates, transaction/transfer mutations, processed timestamps/references, legacy mutations and helper-routine execution remain denied.

`db:upgrade:verify` returned the unchanged digest `ddf2ae493a6f1dcaff3854ea41e796f45aab56ac634da80dfde659283d5c77a0`. Main data remains ten frozen imported accounts and no new modern payroll/transaction records.

## Limits and next checkpoint

No external funds were moved. A second authorized identity is needed for real payroll approval; only the previously supplied administrator was provisioned in the main application. Imported accounts remain frozen and incomplete employee data remains explicit. Browser visual testing is blocked by the existing tool access policy; do a manual desktop/mobile and keyboard review. Vercel deployment still needs reachable hosted MySQL, verified TLS, server secrets and explicit cloud provisioning. Phase 8 dashboard analytics is the next implementation phase.
