# Vercel deployment — frontend and API

The repository is configured for Vite static output plus one Node Express function. **No Vercel deployment has been performed or cloud-tested.** Local handler/proxy tests are not a substitute for a deployed preview check.

## Project configuration

Import the repository with Root Directory at its root, Node 24.x and the checked-in vercel.json:

- Install: `npm ci`
- Build: `npm run build` (type checks all workspaces, then builds frontend)
- Static output: `client/dist`
- `/api/:path*` → `/api/index`, the Express adapter (ordered before frontend rewrites)
- `/login`, `/preview`, `/app` and `/app/:path*` → `/index.html`

The adapter exports the app without starting a listener. Local listening exists only in server/src/local.ts. API routes must return JSON; unknown authenticated API paths return a JSON 404 rather than HTML.

## Server environment and database

Provision a reachable MySQL 8 instance with InnoDB, TLS and trigger support. The MySQL80 process on this PC is not a cloud endpoint. Apply reviewed migrations and provision the restricted API user from a trusted administrative environment. Do not run migrations or seeds in the build or function startup.

Set server-side Vercel environment variables for the intended deployment environment:

| Variable | Value |
| --- | --- |
| MYSQL_HOST / MYSQL_PORT | Hosted MySQL hostname and port |
| MYSQL_DATABASE | Environment-specific application schema |
| MYSQL_RUNTIME_USER / MYSQL_RUNTIME_PASSWORD | Restricted API account, never root |
| MYSQL_SSL | `true` for remote verified TLS |
| MYSQL_SSL_CA | Optional deployed CA certificate file path when the provider is not trusted by system roots; do not copy a local Windows path |
| AUTH_SECRET | At least 32 random bytes, encoded as a string of at least 43 characters |
| APP_ORIGIN | Exact HTTPS origin, such as `https://your-project.vercel.app`, with no trailing slash |
| NODE_ENV | `production` |

Do not set VITE_ credentials. Do not upload root .env, .env.admin.json or database/backups; .gitignore and .vercelignore exclude them. Administrative MYSQL_USER/MYSQL_PASSWORD and bootstrap identity settings are not needed in the running cloud API.

Use separate preview and production schemas/accounts. A preview URL must match its APP_ORIGIN configuration; arbitrary preview origins are not automatically trusted. Provision an application administrator in the target environment through a reviewed administrative setup; do not deploy local root credentials as an API fallback.

Each instance has at most five connections, at most twenty queued acquisitions and a ten-second idle timeout. The Vercel lifecycle helper is attached to mysql2 release events when running on Vercel. Pool caps are per instance; hosted database capacity still needs workload-specific verification.

## Preview acceptance before production

1. Load `/login` and a direct `/app/customers` link; unauthenticated users should reach sign-in.
2. Check `/api/v1/health/live` and `/api/v1/health/ready`; database readiness must report 503 if unavailable.
3. Sign in with a provisioned test identity. Verify Secure/HttpOnly/SameSite=Lax __Host-ledgerline cookie and reload persistence.
4. Verify all three record modules, read-only roles, invalid/expired sessions, rejected CSRF/origin and sign-out.
5. Verify `/api/v1/not-found` is JSON and no frontend asset requests reach the API.
6. Review 390/768/1440 layouts, keyboard navigation, server logs and connection counts under expected concurrency.
7. Confirm preview credentials cannot access production and public build assets contain no secrets.

References checked for this implementation: [Vite functions](https://vercel.com/docs/frameworks/frontend/vite), [Node functions](https://vercel.com/docs/functions/runtimes/node-js), [pool lifecycle](https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute).

## Financial deployment additions (Phases 3, 6 and 7)

Apply migrations through 012 on the chosen clean/legacy track before switching application traffic. Do not run migrations during Vercel requests. Readiness now checks employment/payroll version columns and visibility of the five public procedures plus salary function.

Hosted MySQL must permit stored procedures, functions, triggers, enforced checks and transactions. Migration-created routines use the migration account as their default DEFINER. For hosted production, provision a reviewed, durable routine owner with only the required schema privileges; do not use the Vercel runtime account as a migration administrator. Ensure the definer account exists after restores. Six reporting views use SQL SECURITY INVOKER. Provider restrictions on function creation/binlogging must be resolved through that provider's supported administrative workflow, not by weakening runtime privileges.

`server/scripts/grants.ts` records new privileges. The local setup intentionally uses the local generated user and `localhost`; adapt the host/account identity for the selected provider. Grant EXECUTE only on the five `sp_*` public procedures and `calculate_net_salary`. Do not grant EXECUTE on `ll_*`, direct account balance updates, transaction/transfer writes, operation-request writes or payroll processing timestamps/reference columns. Read access for payroll/audit is restricted further by API permissions; the shared runtime credential is trusted server infrastructure.

The existing Vercel adapter serves these new routes without extra functions, persistent processes or schedulers. Verify hosted readiness and restricted-runtime grants after deployment. Payroll records internal completion only; it is not connected to banking rails.

## Dashboard and administration additions (Phases 8 and 9)

Apply migration 013 before enabling the new user routes, plus the reviewed grants in server/scripts/admin-grants.ts. Hosted MySQL must support connection-scoped GET_LOCK/RELEASE_LOCK on the same writer; these serialize administrator changes. User/role table privileges are trusted server capabilities, with API permissions enforced for every request. Passwords are never sent to the browser after creation/reset.

In a deployed preview, check dashboard permission isolation, all four report filters, CSV export permissions, user creation/session revocation, concurrent administrator changes, audit browsing and reconciliation. Verify direct navigation to /app/reports and /app/users. The existing adapter and frontend rewrites cover these routes. No new Vercel functions are required.
