# Ledgerline — colleague feature and role guide

Ledgerline is an academic banking and payroll management website. It records internal banking operations and payroll workflow; it does not send money through external banking or salary-payment services.

## Roles

Users may have multiple roles; permissions combine. There is no separate customer login or employee self-service portal.

| Functionality | Administrator | Banking Staff | Payroll Manager | Auditor |
| --- | --- | --- | --- | --- |
| Banking dashboard and reports, CSV export | Yes | Yes | No | Yes |
| Payroll dashboard and reports, CSV export | Yes | No | Yes | Yes |
| View customers and accounts | Yes | Yes | No | Yes |
| Create/update customers and accounts | Yes | Yes | No | No |
| Confirm imported opening-balance reviews | Yes | No | No | No |
| View transaction history | Yes | Yes | No | Yes |
| Deposit, withdraw and transfer | Yes | Yes | No | No |
| Reverse eligible transactions | Yes | No | No | No |
| View branches | Yes | Yes | No | Yes |
| Create/update/deactivate branches | Yes | No | No | No |
| View employees and payroll | Yes | No | Yes | Yes |
| Create/update employees | Yes | No | Yes | No |
| Prepare, submit, approve/reject and process payroll | Yes* | No | Yes* | No |
| Browse general audit logs | Yes | No | No | Yes |
| Create users, assign roles, disable access, reset passwords | Yes | No | No | No |
| Read system settings and reconciliation | Yes | No | No | No |

*Payroll approval/rejection must be performed by someone other than the preparer. Administrator access does not bypass this rule. Two different payroll managers, or a payroll manager and an administrator, can provide independent review. The auditor can read sensitive employee/payroll data and export reports, so assign this role only to colleagues who need that access.

## Website functionality

1. **Sign in and sessions:** private authenticated workspace, permission-controlled navigation, session expiration and logout. Administrators manage access; public registration and email password recovery are not implemented.
2. **Dashboard:** current account/customer/balance/frozen-account and employee figures as permitted, date-filtered banking/payroll activity, charts with exact-value tables, recent records and shortcuts. Current balances do not become historical balances when dates change.
3. **Customers:** searchable, paginated records, detail view, creation and validated edits. Deactivation requires the customer's accounts to be closed.
4. **Accounts:** search/filter/detail views, zero-balance account creation linked to a customer and employee, permitted status updates, activation checks, freezing and eligible closure. Balances and ownership cannot be edited directly; closed accounts cannot reopen.
5. **Branches:** searchable branch records and administrator-controlled creation, edits and status changes.
6. **Employees:** searchable records, employment details and activation/deactivation safeguards. Imported incomplete employment facts must be reviewed before payroll eligibility.
7. **Banking transactions:** reviewed deposits, withdrawals and transfers; exact-decimal amounts, active-account checks, insufficient-funds checks, atomic transfer pairs, reference receipts and searchable dated history. Retry keys prevent duplicated postings after uncertain network results. Administrators can create eligible compensating reversals; posted history is not rewritten.
8. **Payroll:** draft/edit, exact gross and net previews, submit, independent approve/reject, revise rejected drafts and process approved records. Duplicate employee/month entries are blocked. Processing is retry-safe and processed payroll is immutable. Monthly summaries and per-record audit history are available.
9. **Reports:** banking ledger, payroll, current account reconciliation and branch activity. Filters, pagination and authorized CSV download; exports are audited and limited to 5,000 rows. Narrow filters when a report exceeds the limit. Account reports are current snapshots, while payroll reports filter payroll periods.
10. **User administration:** create a named colleague with an initial password, assign one or more of four fixed roles, edit identity/access, disable an account or reset a password. Review changes before saving. Access changes invalidate existing sessions. The system prevents self-disable, self-removal of administrator access and loss of the last active administrator. Custom role definitions are not editable.
11. **Audit logs:** authorized search by date/text, pagination, actor/action details and expandable before/after values. Passwords and password hashes are excluded.
12. **Settings:** read-only operating information, currency/time conventions and reconciliation status. This is not an editable configuration panel.
13. **Public pages:** landing page, sign-in and a clearly labelled fictional dashboard preview, separate from live records.

## Share access with colleagues

As administrator, open **Users**, create each colleague's individual account and select the minimum roles needed. Share their initial password privately; the app does not email invitations. Do not share your administrator account, MySQL password, `.env`, `.env.admin.json` or backups.

The local address `http://127.0.0.1:5173` works only on the computer running the application. Colleagues on their own devices will need the eventual deployed HTTPS address and their individual application accounts. No public deployment is available yet. Follow [Connect and visualize](CONNECT_AND_VISUALIZE.md) for running locally and [Vercel deployment](VERCEL_DEPLOYMENT.md) for hosting prerequisites.

## Suggested demonstration

Use a separate demonstration/test database with fictional records. Show the role-specific dashboard, create a customer and zero-balance account, demonstrate a deposit/transfer and receipt, prepare payroll and sign in as a second authorized reviewer, then display reports and audit history. Show an auditor account reading/exporting without write controls. Do not post demonstration money or payroll into the preserved main database.

The local main database preserves its original 61 rows and opening balances. An administrator can now review an imported opening balance on its account detail page: compare source and reconciliation, add a note and explicitly confirm. This records the review without changing the balance; activation is a separate edit. Banking staff and auditors can inspect the evidence but cannot approve it. New activity charts can legitimately be empty. See [cloud update and review instructions](FINAL_AUDIT_2026_10_15.md); hosted acceptance of this update and responsive browser acceptance remain pending.
