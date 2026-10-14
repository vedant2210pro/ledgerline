# Phase 3 implementation plan

1. Add immutable forward SQL migrations on both clean and legacy tracks: exact-decimal salary function, atomic financial procedures, reconciliation/reporting views and posted-history protections.
2. Keep runtime balance writes prohibited. Grant EXECUTE only on public procedures; validate active actors and permissions inside SQL. The server remains the trusted actor-identity boundary.
3. Test fictional data in banking_payroll_test: idempotency payload conflicts, concurrent withdrawals/transfers, insufficient funds, frozen accounts, full transfer reversals, payroll separation of duties, failure rollback and reconciliation.
4. Back up the main database, apply verified migrations and compare the original six tables, five views and two triggers by digest.
5. Run existing database/API/UI checks and production build; record deployment requirements and remaining Phase 6 work.

Procedures own transactions and must be called on an autocommit connection without an outer transaction. No automatic event scheduler or cursor is needed: set-based reporting and explicit payroll processing avoid unattended financial mutations.
