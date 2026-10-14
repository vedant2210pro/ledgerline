# Phases 4 and 5 implementation scope

The user explicitly requested both phases on 11 October 2026, superseding the checkpoint between these two phases. Phase 3 remains deferred. Implement only necessary auth/entity schema additions, not deposit/withdrawal/transfer/payroll routines.

1. Shared strict input schemas and TypeScript contracts; Express 5 API, bounded MySQL pool and safe errors; same-origin Vercel adapter and Vite proxy.
2. Password hashing, opaque hashed sessions, origin and CSRF checks, durable atomic login throttling, permission checks on every route, liveness/readiness and administrative bootstrap. Separate runtime DB credentials with column-scoped mutation grants.
3. Customer/account/branch list/search/filter/pagination/details/create/update/status workflows. Atomic audit logging and optimistic versions. Reject arbitrary balances/actors, inactive relationships, funded closure, reopening closed accounts and imported activation before review. No hard deletes.
4. React login/protected layout, live record tables/forms and details, permission-aware controls, loading/empty/error states and responsive keyboard-accessible UI. Dashboard analytics remain visibly pending; public illustrative preview stays separate.
5. Test real MySQL-backed auth/CRUD/permission/CSRF/concurrency/rollback and deployment adapter locally. Check UI, types, lint, builds; update status/API/security/deployment guides. No cloud deployment claim without a verified deployment.

Files: server/src and tests/scripts, shared/src, api/index.ts, additive database migrations, runtime provisioning script, client auth/services/pages/layouts/styles, root scripts/Vercel configuration and docs. Existing source records and six legacy tables remain unchanged. Back up before schema additions. Tests write only to banking_payroll_test and roll back or remove only their own tagged fixtures.

Acceptance: usable sign-in with supplied administrator identity; least-privilege runtime access; server-enforced permissions/validation; complete Phase 5 workflows including safe status changes; real failure/concurrency tests pass; local frontend/backend integration verified; Vercel setup documented with hosted MySQL still required.
