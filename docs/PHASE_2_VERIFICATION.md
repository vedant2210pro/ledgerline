# Phase 2 verification — 11 October 2026

## Outcome

Phase 2 is complete locally, including the explicitly approved data-preserving upgrade. Phase 3 has not started. Machine-readable final evidence is in `LEGACY_UPGRADE_EVIDENCE.json`.

| Check | Executed result |
| --- | --- |
| `npm run db:test` | 24 passed, zero failures/skips on actual MySQL 8.0.43 |
| Clean migration path | 8 migrations, 22 InnoDB tables; original six migration checksums preserved |
| `npm run db:upgrade:apply` | Restored backup, rehearsed all safeguards, then applied to banking_payroll_db |
| `npm run db:verify` | 28 tables, 7 dedicated upgrade migrations, 35 FKs, 50 CHECKs, 22 UNIQUE constraints |
| `npm run db:upgrade:verify` | 61 original rows unchanged; 40 mapped core records; 10 frozen accounts; 11 historical payroll reservations |
| Backup restoration | Per-row SHA-256 and canonical table/view/trigger definitions match the source; all five views readable |
| Import rollback | Failures after records 1, 15, 35, 45 and 61 left all eight import/target tables empty |
| Idempotency | Import repeated on rehearsal and source without duplicate/overwritten records; upgrade DDL rerun skipped |
| Frozen account guard | Posting rejected; activation rejected until explicit reviewed snapshot; test review rolled back |
| Historical payroll guard | INSERT and UPDATE into a reserved employee/month rejected; distinct future month accepted in rolled-back fixture |
| Employee unknowns | Imported designation/join date remain unknown; new employee missing required fields rejected |
| Convergence | All 21 shared modern table definitions and role-permission pairs match the clean schema |
| Migration safeguards | Modified checksum and failed DDL marker rejected on restored copy; markers restored afterward |
| `npm run typecheck`, `npm run lint`, `npm run build` | Passed for the final implementation; production frontend bundles generated |

## Preservation and reconciliation

The original six tables retain 10 customers, 10 employees, 10 branches, 10 accounts, 11 payroll rows and 10 transaction rows. Five legacy views and two original triggers remain attached to their original objects. Modern tables use plural names and `payroll_records` to avoid collisions.

Every copied field was compared by ordered canonical hashes. Opening snapshots exactly match stored account balances; aggregate sums also match using MySQL DECIMAL. No historical event was posted into the modern ledger. Two ambiguous transfers retain an unresolved marker, and all ten imported accounts stay frozen pending review. Payroll months are derived from legacy pay_date with explicit provenance, not evidence of modern approval or processing.

A dedicated connection held READ locks on all six legacy tables during final backup/rehearsal/import. No active legacy query was found before locking; existing grants were not changed. Closing that connection released the locks. Future application credentials must have SELECT-only access to legacy history; existing administrative users can still change records. Verification detects deviations from the recorded import digest.

The first provisional rehearsal exposed a broad identifier replacement during code review; that candidate was superseded before applying the upgrade. Explicit table-name substitutions plus a clean/upgrade schema-and-permission comparison verified the final version. Legacy FKs report NO ACTION and are preserved; modern FKs use RESTRICT. The verifier accepts that legacy definition without rewriting it.

## Backup and rollback

Final private backup: `database/backups/20261011120536420/legacy.sql`. Its SHA-256 and the retained restored schema name are in the evidence file. Restoration included original data, views and triggers; credentials were passed only in the MySQL child-process environment, never command arguments or tracked files. The dump and earlier rehearsal artifacts remain local and ignored.

Import data is transactional; MySQL DDL is not. An incomplete upgrade marker stops automatic retries. Preserve the backup and inspect any partially created objects before a reviewed corrective migration. No automatic DROP/restore-over-live-data cleanup exists. After future financial activity, use forward correction rather than overwriting later records with this backup.

## Remaining boundaries

No cloud MySQL/Vercel deployment, backend API, authentication, runtime privilege enforcement, financial routines, concurrent financial posting, complete immutable ledger or connected dashboard. The four upgrade integrity triggers are narrow safeguards, not the Phase 3 business-routine implementation. Import verification is a cutover-state check: legitimate future changes to profiles/accounts need the later ongoing reconciliation contract.

Typography review from this phase passed at 1440/768/390 widths with no measured overflow. Self-hosted Manrope/DM Sans/Instrument Serif and larger labels remain; screenshots are in `docs/screenshots/typography-desktop.jpg` and `typography-mobile.jpg`.
