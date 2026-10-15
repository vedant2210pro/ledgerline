# API contracts

Prefix: `/api/v1`. JSON bodies, opaque HttpOnly session cookies, exact configured Origin for mutations, and `X-CSRF-Token` from login or `/auth/me`. Money and IDs are strings; row_version is an integer. Responses set Cache-Control: no-store and X-Request-ID.

## Authentication and health

| Method/path | Contract |
| --- | --- |
| GET /health/live | Public process liveness, `{status:"ok"}` |
| GET /health/ready | Public bounded DB/reference/schema check; 503 on unavailable DB, no internals |
| POST /auth/login | `{email,password}` → `{user,csrfToken}` plus cookie; origin/JSON required; credentials failure generic |
| GET /auth/me | Current user ID/name/email/roles/permissions and CSRF token; expired/revoked/disabled → 401 |
| POST /auth/logout | JSON `{}`, trusted origin and CSRF; durably revokes session, clears cookie; 204 |

No public registration or password-reset email exists. Initial administrator provisioning is a local administrative command; authenticated user, fixed-role and employee management endpoints are documented below.

## Customer, account and branch resources

For each of `/customers`, `/accounts` and `/branches`:

| Method/path | Permission | Result |
| --- | --- | --- |
| GET /resource | resource.view | `{items,page,pageSize,total}` |
| GET /resource/:id | resource.view | One record; 404 if missing |
| POST /resource | resource.create | Created record, 201 |
| PATCH /resource/:id | resource.update | Updated record with incremented row_version |
| DELETE /resource/:id | resource.update | 405; use permitted status changes, history retained |

List query: search (max 80), status (resource allowlist), page (1–100000), pageSize (1–50, default 10). Stable newest-ID order. LIKE metacharacters are escaped, all values parameterized, and table/column names come from closed internal maps. Customer lists include account counts; account lists join customer/officer names and opening-snapshot review state. Counts/pages are read in one transaction.

Customer POST fields: name, email, phone, address, customer_status (`active`/`inactive`). PATCH uses the same complete editable fields plus row_version. Names trim; emails trim/lowercase; phone syntax and lengths are validated. Deactivation rejects any linked account not closed.

Branch POST fields: branch_code, name, address, phone, branch_status (`active`/`inactive`). PATCH adds row_version. Codes are uppercase letters/digits/hyphens. Uniqueness conflicts return 409.

Account POST fields: customer_id, employee_id, account_type (`savings`/`current`/`salary`), open_date (valid MySQL date, not future). Number is generated server-side; balance defaults to exact 0.00 INR. Customer must be active; officer must be active or an explicitly labeled imported legacy_incomplete employee. No employment facts are invented.

Account PATCH accepts only employee_id, account_status (`active`/`frozen`/`closed`), row_version. Funded closure is rejected. Closed records cannot change or reopen. Pending imported opening snapshots prohibit leaving frozen status. No balance/owner/type/date rewrite is accepted. Officer/customer eligibility is checked when assigning a different officer or activating an account; an unchanged officer on leave does not prevent freezing it.

GET `/accounts/:id/opening-review` requires accounts.view and returns the source/opening/current balances, ledger movement, discrepancy, source fingerprint check, row_version and review metadata. POST to the same path requires an active administrator, accounts.update, Origin and CSRF. Body: `{row_version, opening_balance, review_note, confirmed:true}`; note is 10–1000 trimmed characters and money is a string. The account must be frozen with a pending snapshot, verified unchanged source and zero discrepancy. The review locks the account/snapshot, updates only review metadata and row_version, and commits an audit event atomically. It does not change the balance or activate the account. Stale, duplicate or inconsistent reviews return 409; accounts without imported snapshots return 404.

Related endpoints:

- GET /customers/:id/accounts: requires both customers.view and accounts.view; paginated account relationships.
- GET /lookups/customers?search=...: requires accounts.create; first 50 active customers matching name/email.
- GET /lookups/employees?search=...: requires accounts.create or accounts.update; first 50 assignable employees, exposing only ID/name/code/status. No employee email or salary is exposed by this lookup.

## Errors and concurrency

`{error:{code,message,requestId,fields?}}`. Validation returns 422 with optional field messages. Authentication 401; permission/CSRF/origin 403; duplicates/stale writes/relationship conflicts 409; login throttle 429; unavailable service 503. JSON parse/body-limit errors use 400/413. Errors never return raw SQL, credentials or driver stacks.

PATCH locks the target row, checks row_version and related records, changes allowed columns and inserts actor-attributed before/after audit JSON in one transaction. Two concurrent writes using one version result in one success and one stale-write rejection. An audit failure rolls back the mutation. Deadlocks/timeouts produce a retryable 409; the API does not silently replay writes.

POST record creation is not idempotent. If a connection fails after submission, inspect the record list before creating another account. Financial operations use the idempotency contracts below. After an uncertain opening-review result, reload its metadata before retrying.

## Phases 6 and 7: financial and payroll routes

All routes below use `/api/v1`, authenticated sessions and server-side permissions. POST/PATCH require the trusted Origin, JSON and X-CSRF-Token. Record IDs and money values are strings; all calculations use BigInt cents or MySQL DECIMAL, never floating-point money.

| Method / path | Permission | Request / result |
|---|---|---|
| GET /employees, /employees/:id | employees.view | Search/status/pagination or full employment record |
| POST /employees | employees.create | employee_code, name, department, phone, email, designation, date_of_joining, employment_status |
| PATCH /employees/:id | employees.update | Same fields plus row_version; assigned open accounts/pending payroll block deactivation |
| GET /lookups/posting/accounts, /lookups/posting/branches | transactions.view | Active searchable choices; maximum 50, refine search for more |
| GET /transactions | transactions.view | search, status (posting type), account_id, date_from/date_to (UTC inclusive), page/pageSize |
| POST /transactions/deposit, /transactions/withdrawal | transactions.process | account_id, branch_id, amount, description, idempotency_key |
| POST /transactions/transfer | transactions.process | Same plus destination_account_id, different from source |
| POST /transactions/:id/reverse | transactions.reverse | branch_id, reason, idempotency_key; either original transfer leg reverses the complete pair |
| POST /payroll/preview | payroll.create | salary_amount, bonus, deductions; returns gross_salary, net_salary |
| GET /payroll, /payroll/:id | payroll.view | Search/status/pagination or saved payroll record |
| POST /payroll | payroll.create | employee_id, payroll_period (YYYY-MM-01), salary_amount, bonus, deductions |
| PATCH /payroll/:id | payroll.update | Same plus row_version; only draft/rejected records; editor becomes preparer |
| POST /payroll/:id/submit | payroll.update | row_version; draft → pending_approval |
| POST /payroll/:id/approve | payroll.approve | row_version; requires a distinct preparer/reviewer |
| POST /payroll/:id/reject | payroll.approve | row_version, reason; independent review required |
| POST /payroll/:id/process | payroll.process | idempotency_key, description; approved → processed |
| GET /payroll/:id/audit | payroll.view | Paginated actor/action/time and before/after history scoped to that payroll |
| GET /payroll/summary | reports.payroll.view | Paginated monthly/status groups and exact gross/deduction/net totals |

Posting and processing return `{ reference_number, replayed }`: 201 for a new commit, 200 for a completed replay. Keys are 8–100 ASCII letters/digits/`._:-`, unique per actor and operation. Reuse the same key and payload after a timeout; never generate a new key to retry an uncertain outcome. A changed payload under the same key returns 409. The UI retains pending posting/processing requests in user-scoped session storage; session credentials remain HttpOnly cookies.

Business conflicts return 409 with a safe explanation. Invalid input returns 422; role/CSRF failures return 403. Unknown database signals remain 500 and never leak SQL. Known deadlocks/timeouts receive bounded same-key retries; exhausted conflicts return RETRY_REQUIRED. Financial history has no edit/delete endpoint. Legacy payroll months stay reserved and imported accounts cannot post while frozen. Processing rechecks employee eligibility and the approver's active permissions.

## Phases 8 and 9

All paths below use /api/v1 and require an authenticated session. Administrative writes also require the configured Origin and X-CSRF-Token.

| Route | Permission / behavior |
| --- | --- |
| GET /dashboard | reports.banking.view and/or reports.payroll.view; returns only permitted domains |
| GET /reports/banking, /reports/accounts, /reports/branches | reports.banking.view |
| GET /reports/payroll | reports.payroll.view |
| GET /reports/:kind/export | Corresponding report view AND export permission; CSV, at most 5,000 rows |
| GET /users, /users/:id, /roles | users.administer; fixed roles and their permission matrix |
| POST /users | users.administer; name, email, password (12–128 characters), roles |
| PATCH /users/:id | users.administer; name, email, account_status, roles, row_version |
| POST /users/:id/password | users.administer; password, row_version |
| GET /audit-logs | audit.view |
| GET /system | settings.administer; read-only policies and reconciliation |

Reports and audit use date_from/date_to (ISO dates, ordered, at most 367 inclusive days), search, page and pageSize (maximum 50); report types also validate their supported status values. Defaults select the last 30 UTC dates. Account reports are current snapshots and do not time-filter rows. Payroll reports use payroll_period. Exports include all matching rows up to the limit; exceeding it returns 422 rather than a truncated file. Export access creates an audit event.

User roles are administrator, banking_staff, payroll_manager and auditor. Editing access or resetting a password revokes the target's sessions. Stale versions and unsafe administrator removal return 409. Passwords and hashes never appear in public user records or audit values. No user deletion or role-definition editing endpoint exists.
