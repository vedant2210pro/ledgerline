# Final fixes and cloud update — 15 October 2026

## What changed

- Added the missing administrator opening-balance review on imported account detail pages. It displays the retained source balance, imported balance, current balance, ledger movement and discrepancy. Review requires a source comparison, note and explicit confirmation, and records an audit event. Activation remains a separate account edit.
- The server blocks review if the retained source changed, import verification is missing, reconciliation differs, the account is no longer frozen or another user already changed/reviewed it. Concurrent reviews cannot produce duplicate approvals. Audit failure rolls the review back. No balance is changed by this workflow.
- Disabled unavailable account status choices while an opening review is pending.
- Fixed freezing an account with an unchanged officer who is on leave. Assigning an officer or activating an account still checks eligibility.
- Fixed payroll audit pagination discarding unsaved form edits. Failed payroll loads no longer claim there are no records.
- GET validation errors now explain the rejected filter instead of asking users to find nonexistent highlighted fields. Write forms retain their field-validation behavior.
- Corrected outdated feature/security documentation. Earlier Vercel bundle and rewrite-query fixes remain in the application.

## Verification

| Check | Result |
| --- | --- |
| MySQL schema tests | 24 passed |
| API tests | 55 passed |
| React/jsdom tests | 35 passed |
| Total automated tests | 114 passed |
| Lint, TypeScript and production build | Passed |
| Main/test financial reconciliation | Passed |
| Original legacy preservation verifier | Passed: 61 source rows preserved |
| Restricted runtime source comparisons | All 10 imported account sources matched their saved fingerprints/balances |
| Built Vercel handler smoke check | Liveness, local-database readiness and unauthenticated review rejection passed |

No main account was approved or activated during this work, and no main balances were changed. Review mutations were tested only with fictional fixtures in banking_payroll_test. Existing migrations were not edited. Source digest remains `ddf2ae493a6f1dcaff3854ea41e796f45aab56ac634da80dfde659283d5c77a0`.

The changes are local until you deploy them. Hosted acceptance of this update and manual responsive/browser review remain outstanding; automated checks do not establish that every possible defect is absent. Two upstream Zod comment-annotation warnings do not fail the build.

## Update your existing cloud deployment

### 1. Add the required database permissions

In MySQL Workbench, open your **Ledgerline Cloud** connection as **avnadmin**. Open `D:\DBMS\docs\CLOUD_OPENING_REVIEW_GRANTS.sql` using File → Open SQL Script. Execute the entire script with the lightning button. Check that its four GRANT statements succeed; the last statement displays the grants.

This gives ledgerline_web read access to import/source evidence and permission to write review metadata. It does not approve accounts, edit balances or reimport data. Do not run database initialization or restore the old dump for this update.

### 2. Push the tested code

From PowerShell in D:\DBMS:

```powershell
git status --short
git add README.md client/src server/src server/scripts server/tests shared/src docs
git diff --cached --stat
git commit -m "Add audited opening balance review and fix record workflows"
git push
```

Review the staged file list before committing; it should contain source, tests and documentation only. Do not add `.env`, `.env.admin.json`, backups or credentials. LF/CRLF notices are line-ending notices, not failed commands.

### 3. Wait for the new deployment

In the Vercel project, wait for the deployment triggered by this push to become Ready. Verify that it shows this new commit. Open https://ledgerline-lime.vercel.app and refresh. If the old screen remains, use Ctrl+Shift+R. This update requires no new environment variable or schema migration.

### 4. Review one imported account

1. Sign in as your application administrator.
2. Open **Accounts**, then the imported account you want to inspect (for example LEGACY-A-10).
3. Scroll to **Opening balance review** below the account form.
4. Compare the original source and imported opening balances with your original statement/lab record. Check that the source matches and the discrepancy is ₹0.00. Current balance can differ from opening balance only by the displayed net ledger movement.
5. If correct, tick the source-comparison checkbox and write a meaningful review note of at least 10 characters describing what you checked.
6. Click **Review confirmation**, inspect the account and amount, then click **Confirm review**.
7. The account remains frozen. If you intend to use it for transactions, set its status to **active** in the account form, check the assigned officer, and save/confirm the change. Activation still requires eligible customer/officer records.
8. Check **Audit history** for `accounts.opening_review` and the separate account update.

Do not confirm an incorrect balance. A blocked source/discrepancy check requires investigation, not a direct SQL bypass. If a review submission times out, reload the account first: the review may already have committed.

### 5. Check the deployed update

Open the dashboard, accounts, employees, reports and audit pages. Check that normal filter requests load. On a draft payroll record, change a value and page its audit history; the unsaved value should remain. Use fictional records in a separate test environment for deposits, transfers or payroll demonstrations.

If the review panel returns a service error, first confirm the cloud grants succeeded and that Vercel is serving the latest commit. Keep the request ID and relevant Vercel error code for diagnosis; do not share passwords.
