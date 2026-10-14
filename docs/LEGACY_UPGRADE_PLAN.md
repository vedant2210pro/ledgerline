# Data-preserving upgrade plan for banking_payroll_db

Status: **approved and applied on 11 October 2026**. The following records the reviewed approach. Implementation and final evidence are in PHASE_2_VERIFICATION.md and LEGACY_UPGRADE_EVIDENCE.json. Source data and original objects remain preserved; Phase 3 awaits approval.

## Verified inventory — 11 October 2026

Read-only inspection found:

| Existing object | Exact rows |
| --- | ---: |
| customer | 10 |
| account | 10 |
| employee | 10 |
| payroll | 11 |
| branch | 10 |
| bank_transaction | 10 |

There are five views and two triggers, no stored routines or scheduled events. Full schema/aggregate inventory is in `LEGACY_INVENTORY.json`; it contains no individual customer records or passwords.

- Contact fields required by the proposed schema are populated in the current records. No orphan core relationships, negative/null balances, nonpositive transaction amounts, negative payroll inputs or duplicate employee/month payroll groups were found.
- Account types are Savings (7) and Current (3), which map to lowercase target values without changing meaning.
- Transactions are Deposit (4), Withdrawal (4), and Transfer (2). Existing Transfer rows contain one account reference, with no direction, counterparty or transfer-group reference. Do not invent debit/credit pairs.
- All 10 stored account balances differ from the net of the available deposit/withdrawal history. This is not proof that balances are wrong: unrecorded opening balances and ambiguous transfers can explain the difference. Do not replay the existing history into account balances or silently replace balances with an aggregate.
- All employees lack designation, employment status, and date_of_joining columns. Do not fabricate hire dates or designations.
- Existing payroll contains paid-date/base/bonus/deductions values but no authenticated actor, approval, period or processing evidence. Preserve the stored amounts; do not label them as approved/processed through the new system.
- `Calculate_Payroll_Deduction` currently changes each inserted payroll deduction to 10% of base salary. `Check_Account_Balance` rejects negative balances on account INSERT only. Do not attach these legacy triggers to modern payroll/transaction workflows.

## Recommended approach: additive import with a read-only legacy archive

Keep the database name banking_payroll_db and retain all six existing tables, their primary keys, all five views, and both legacy triggers without changing historical values. Add modern plural tables alongside them. Because the original `payroll` name is already in use, the upgraded application's modern payroll table should be `payroll_records`. The conceptual PAYROLL entity and essential relationships remain the same.

A dedicated legacy-upgrade migration track is required; do not bypass the clean-install runner's nonempty-schema guard or pretend that existing tables satisfy its checksums. Future clean-install migrations must converge on the same payroll_records name through a new forward migration, without editing the six baseline files already applied in the test database.

### Additional upgrade-only records

1. `legacy_import_batches`: source schema, inventory digest, importer identity/time, verification status and row counts.
2. `legacy_record_links`: source table/key to modern table/key with unique mappings and source digest, so retries never duplicate records.
3. `account_opening_snapshots`: original balance per imported account at cutover, reference to the import batch, and reconciliation state. An opening snapshot is not a fabricated deposit or an external transfer.
4. Retain original `bank_transaction` and `payroll` as read-only historical sources. Future reports explicitly separate imported history from new operations. Import provenance identifies the importer, not a fictitious original actor.

These additions are now installed; legacy_payroll_periods also reserves derived historical months. Both installation tracks converge on these supporting tables.

## Field mapping and rules

| Source | Proposed mapping | Preservation rule |
| --- | --- | --- |
| customer | customers | Preserve primary ID and original name/contact values; mark provenance; no silent case/content edits |
| employee | employees | Preserve ID/name/contact/department; add a documented legacy-incomplete state and nullable unknown joining/designation fields for imported records only |
| branch | branches | Preserve ID/name/address/phone; deterministic codes such as LEGACY-B-<id> are new identifiers, not historical claims |
| account | accounts + opening snapshot | Preserve ID/customer/officer/date/balance; deterministic account identifier LEGACY-A-<id>; lowercase known account types; import frozen pending reconciliation |
| bank_transaction | retained historical source | Preserve all rows, dates, descriptions, types and amounts; Transfer rows flagged unresolved; never synthesize counterparties or new completed transactions |
| payroll | retained historical source; payroll_records for new work | Preserve recorded salary/bonus/deductions/pay_date; show derived gross/net as calculations, not new payment events; derive a candidate month from pay_date only with explicit import provenance |

Imported accounts remain frozen until each opening snapshot/reconciliation decision is reviewed. The future ledger uses opening snapshot + **new** posted movements to derive balances; historical records are not posted a second time. New accounts still start at zero and use the financial procedures for funding.

New payroll for an imported employee/month must check the retained historical payroll periods as well as the new unique constraint, preventing a double payment simply because records span old and new tables. Historical payroll is never automatically submitted, approved or processed.

## Execution sequence after approval

1. Freeze writes from any legacy clients during backup and final import. First inventory all writers; preserving a table does not make it immutable for existing users with write privileges.
2. Create a timestamped local logical backup including schema, data, views, triggers and metadata, with credentials passed securely, not on the command line. Store backups in an ignored `database/backups/` directory. Hash the backup and verify restoration into an isolated rehearsal schema before proceeding. The final backup was created, hashed and restore-verified before application; see the evidence file.
3. Implement the separate versioned upgrade track and convergence migration, then rehearse against the restored copy. Retain legacy object definitions and rows; use side-by-side modern tables and rollback-capable data imports after DDL creation.
4. Import customers, employees and branches with exact ID mappings. Capture unknown employee attributes as unknown with provenance. Import account opening snapshots and frozen account rows atomically; do not run deposit/withdrawal logic during the historical import.
5. Keep historical transactions/payroll readable under a clearly separate legacy-history contract; add unique link/provenance records and reconciliation reports. Prevent historical amounts from being counted twice in new financial totals.
6. Reconcile counts, per-ID field hashes, source/target monetary totals, FK references, opening snapshots and duplicate-key checks. Explicitly verify all 61 original rows and five views remain readable and unchanged. Recheck trigger definitions on their original tables.
7. Rerun import to prove idempotency, inject failures to prove import rollback, test payroll period collisions against legacy history, and verify an imported frozen account cannot be used by new banking operations.
8. Apply to banking_payroll_db only after backup restoration and rehearsal checks succeed. Record evidence and preserve the backup. Leave the old sources intact; do not DROP or rename them as cleanup.
9. Future API credentials receive SELECT-only access to legacy history and only the necessary rights to modern tables/routines. Do not globally revoke or alter the user's existing accounts without a separate explicit request.

## Rollback and acceptance

Before cutover, failure leaves the old tables and their views available. Disable the new application path, roll back the failed data import, and retain its diagnostic metadata; DDL additions require reviewed cleanup, not an assumed transaction rollback. After new financial activity begins, do not restore an old backup over later transactions: use reconciliation and a forward correction.

Upgrade acceptance requires a restored backup, exact source preservation, explicit import mappings/provenance, zero unexplained mismatches, idempotent import and failure tests, correct restrictions for frozen accounts and previously recorded payroll periods, and verified views. Missing dates, transaction direction, and approval evidence must remain visibly unknown rather than fabricated.

## Next checkpoint

Phase 2 upgrade acceptance passed. The dedicated upgrade runner applied the additions without modifying legacy objects. Await explicit approval for Phase 3 financial routines and reporting. Account reconciliation and runtime archive grants remain future controlled workflows.
