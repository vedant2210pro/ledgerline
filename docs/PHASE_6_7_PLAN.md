# Phases 6 and 7 implementation plan

The user authorized both phases together on 13 October 2026.

- Finish and verify the Phase 3 SQL foundation before enabling financial operations.
- Phase 6: permission-gated deposit, withdrawal, transfer and reversal APIs; searchable transaction history; searchable account/branch selectors; review-before-post screens, persistent retry keys and receipts. Verify exact balances, concurrency and rollback against MySQL.
- Phase 7: employee CRUD with optimistic versions and preserved history; exact-decimal payroll previews; draft/edit/submit/approve/reject/process workflow; distinct preparer/approver, unique employee/month, immutable processed records; payroll summaries and audit trail.
- Add migrations on both tracks, provision only necessary runtime grants, run integration/component tests and production build, then back up and upgrade the main database without altering legacy records.
- Vercel uses the existing Express function entrypoint and hosted MySQL configuration. These phases do not publish the application or connect to an external payment provider.
