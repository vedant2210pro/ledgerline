# Phase 10 — Integration and quality assurance

Date: 13 October 2026. Automated verification completed; manual browser acceptance remains outstanding.

## Confirmed defect and fix

API readiness checked earlier migrations but omitted migration 013's user version column. A regression test reproduced HTTP 200 against a simulated database missing that column. Readiness now checks `users.row_version` and returns a safe 503 without exposing driver details, releasing the database connection.

## Verification coverage

| Area | Evidence |
| --- | --- |
| Role access | Matrix test checks 14 module/report/admin list endpoints for all four roles plus anonymous requests (70 requests) |
| Authentication | Cookie/hash assertions, durable throttling, Origin/CSRF, disabled/revoked users, expiration, logout and rotation |
| Forms and records | Existing API/UI checks cover validation, references, stale versions, review steps and failure states; this is not exhaustive manual form acceptance |
| Banking | Duplicate deposits, competing withdrawals, opposite-direction transfers, exact balances, reversals and rollback |
| Payroll | Calculations, independent approval, duplicate periods, revoked reviewers, inactive employees, processing and retry behavior |
| Database | Migration counts/checksums/reruns, constraints/relationships, immutable history, routines/views and reconciliation |
| Reports/admin | Permission isolation, aggregates, filters, export escaping/auditing, last-administrator concurrency, reset/session revocation |
| Error handling | Safe JSON responses, validation failures, injected audit rollback and readiness schema failure |
| Preservation | All 61 original rows and the original inventory digest remain unchanged |

## Manual acceptance still required

The browser tool previously rejected local-page access. No alternative browser-control route was used to bypass that restriction. Component tests do not verify actual rendering, responsive layout or end-to-end browser interaction.

Run the app locally and check at 390, 768 and 1440 pixel widths:

- Public landing, sign-in, fictional preview, not-found page and protected-page redirects.
- Dashboard, each record list/new/detail page, transactions, payroll list/detail, reports, users, audit logs and settings.
- Keyboard navigation, visible focus, labelled inputs, validation feedback, modal focus, table overflow, charts and exact-value tables.
- Create/edit/review/cancel flows with fictional data in a separate demonstration database; use a second authorized person for payroll approval.
- Expired session handling, back/forward navigation, refresh on nested routes and interrupted-request retry behavior.

Hosted TLS/cookies, provider database grants, deployment routing and realistic load/capacity checks require the chosen hosted environment. Local EXPLAIN plans and functional concurrency tests are not production performance benchmarks.

The next original phase is **Phase 11: Documentation and delivery**, not automatic cloud publication. See [colleague feature guide](COLLEAGUE_GUIDE.md), [connection guide](CONNECT_AND_VISUALIZE.md) and [Vercel checklist](VERCEL_DEPLOYMENT.md).

## Executed results

94 tests passed: 24 schema tests, 48 API tests (47 against real MySQL and one simulated readiness regression), and 22 UI component tests. Lint, all workspace type checks and the production build passed. Main preservation and main/test financial reconciliation passed, with nine routines and six modern views verified. Two upstream Zod build annotation warnings remain non-blocking. No main business records or migrations were changed in this phase.
