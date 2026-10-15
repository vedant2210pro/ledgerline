# Activate the frozen accounts

The owner requested bulk activation of the academic accounts. The prepared script runs directly on the cloud database; you do not need a website deployment for the activation itself.

1. In MySQL Workbench, open your **Aiven / Ledgerline Cloud** connection using **avnadmin** (not the local connection or ledgerline_web).
2. Choose **File → Open SQL Script** and open `D:\DBMS\docs\ACTIVATE_FROZEN_ACCOUNTS.sql`.
3. Execute the **entire file**, including the DELIMITER and CALL sections, with the execute-all lightning button. Do not execute only the current statement.
4. Check the result named **accounts_activated**, then the account/status/balance results. The final discrepancy query should return no rows. Refresh the website's Accounts page; activated accounts are available for transactions immediately.

The script checks the supplied administrator identity, active customers, available officers, zero reconciliation discrepancies and verified original opening balances. It records the owner's authorization and automated checks honestly in review metadata and audit history. It does not claim a manual statement review, edit any balance, change employees/customers, replay old transactions or reopen closed accounts. Re-running it does not duplicate activation of accounts already active.

If the CALL returns an error, all account/review/audit changes made by that CALL are rolled back. Copy the error text, including its account ID, for diagnosis. Do not remove the checks or directly edit balances. Permission grants and procedure creation are administrative DDL outside the data transaction.

## Review screen fix

The review panel was below the entire account form/sidebar, making the disabled status dropdown appear to have no solution. It is now above the form and explains the three steps: compare and confirm the opening review, then select active and save the account. To publish that layout change:

```powershell
cd D:\DBMS
git add client/src/pages/RecordPage.tsx client/src/components/finance/OpeningBalanceReview.tsx client/src/tests/workflows.test.tsx server/tests/opening-review.test.ts docs/ACTIVATE_FROZEN_ACCOUNTS.sql docs/ACTIVATE_ACCOUNTS_GUIDE.md
git commit -m "Expose account review and add checked bulk activation"
git push
```

Wait for Vercel to show Ready and refresh. The SQL file also includes the grants needed for individual reviews. Future frozen accounts can still be reviewed individually; the server's validation and permissions remain enforced.

## Verification

The actual stored procedure was tested in banking_payroll_test: mismatching source balances block activation; a forced audit failure rolls back the preceding review; successful activation preserves the balance; repeating the request creates no duplicate activation audit. All seven opening-review backend tests passed. No cloud or local main accounts were modified by these tests. Cloud execution is performed by the owner in Workbench.
