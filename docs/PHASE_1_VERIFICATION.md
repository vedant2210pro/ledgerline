# Phase 1 verification — 11 October 2026

## Scope delivered

- Ledgerline wordmark, favicon, navy/ivory/teal visual system and reusable UI primitives.
- Complete landing page: navigation, hero, fictional dashboard illustration, banking, payroll, reporting, workflow, integrity commitments, FAQ and footer.
- Disabled sign-in interface that collects no credentials and clearly states Phase 4 availability.
- Public dashboard preview with fictional figures, Recharts month selection and accessible chart data table.
- Responsive workspace shell with desktop collapse, mobile menu, focus containment/Escape behavior, breadcrumbs and preview visitor menu.
- All ten module destinations, each showing planned scope and phase; not-found pages.
- Vercel frontend configuration, npm workspace/lockfile, README and deployment guide.

## Commands and results

| Command | Result |
| --- | --- |
| npm install | Passed after approved registry access; initial sandbox registry access failed with EACCES |
| npm view ... peerDependencies | Confirmed React Hooks and TypeScript ESLint support ESLint 10 |
| npm install -D eslint@^10 @eslint/js@^10 | Passed; replaced deprecated ESLint 9; npm audit reported 0 vulnerabilities |
| npm ls --depth=0 | Resolved workspace dependencies without missing/invalid package errors |
| npm run format | Passed |
| npm run typecheck | Passed on final sources |
| npm run lint | Passed on final sources with ESLint 10 |
| npm run build | Passed on final sources; Vite 7.3.7, 2197 modules transformed |
| npm run dev | Served the frontend at 127.0.0.1:5173 |
| npm run preview | Served production output at 127.0.0.1:4173 |

An initial JSX closing-tag typo failed typecheck/lint and was corrected before the successful final checks. A first development launch passed a port argument incorrectly through the root npm script; it was stopped and restarted using the documented `npm run dev` command. An initial browser attempt happened before the server started and was retried after the server was available. These failures were not counted as passes.

Production output: index HTML 0.69 kB, CSS 41.00 kB, main JS 296.41 kB, lazily loaded dashboard/chart JS 371.82 kB (gzip approximately 0.42, 9.43, 93.79, and 109.05 kB). Recharts is loaded with the dashboard route rather than the landing page.

## Browser checks actually performed

Using the local browser on the development and production servers:

- Visually inspected landing layout at 1440x1000, 768x1024, and 390x844.
- Inspected dashboard at phone and tablet widths and login at phone width.
- Read document/viewport widths: no horizontal document overflow at the checked landing sizes, phone overview, or phone payroll status page. Tables intentionally scroll within their own container.
- Checked all landing fragment links: no unresolved anchor IDs.
- Expanded the banking-service FAQ and verified the explanatory answer.
- Opened mobile navigation and followed the access-workspace link.
- Verified email, password and sign-in button are disabled and show the preview explanation.
- Opened mobile workspace sidebar, navigated to Payroll, reloaded the nested path, then closed the reopened sidebar with Escape; aria-expanded became false.
- Changed October to September and expanded chart data; September rows matched the displayed series.
- Visited each of the ten sidebar module routes; headings and phase badges matched the route definitions.
- Collapsed and expanded the desktop/tablet sidebar.
- Loaded and reloaded `/app/payroll` from the production preview server, verifying the planned payroll status.
- Loaded `/app/unknown` from production preview and verified the not-found view.
- Opened the production visitor menu, verified no user was signed in, and used Exit preview to return to the landing page.
- Queried browser logs after module checks and production checks: no warnings or errors returned.

Screenshot evidence: `docs/screenshots/landing-desktop.jpg`.

## Boundaries and remaining verification

- This is interface verification, not database-backed business verification. No auth, API, MySQL, transaction, payroll or permission tests are applicable yet.
- No Vercel deployment was made. Local production preview verifies bundled rendering and Vite's fallback, not Vercel routing behavior or response headers. Check the documented routes after the first cloud deployment.
- Semantic labels, visible focus styles, native disclosures, mobile focus containment, an accessible chart data table and reduced-motion CSS are included. A full screen-reader/accessibility conformance audit and OS reduced-motion simulation were not performed.
- Cross-browser/device testing beyond the available Chromium-based browser remains unperformed.
- npm printed an esbuild install-script approval advisory, but the native production build executed successfully. No new global tooling was installed.
- No known blocking interface defect remained in the checks performed. Unfinished modules are explicitly labeled and do not expose fake successful operations.

Use the README manual checklist for review before authorizing Phase 2.