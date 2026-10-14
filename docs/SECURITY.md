# Security boundaries — Phases 4 and 5

This is an academic implementation, not a production banking certification.

## Credentials and sessions

Passwords use asynchronous scrypt with a random 16-byte salt, N=131072, r=8, p=1 and a 64-byte derived key. Verification is timing-safe; unknown users incur the same valid-cost sentinel KDF. Two KDF jobs can run per instance with at most sixteen waiting, bounding memory pressure. Initial application credentials are generated locally in ignored `.env.admin.json`; never reuse the MySQL root password.

Session tokens contain 32 random bytes; MySQL stores only their SHA-256 hashes. Sessions have an absolute eight-hour lifetime. Login rotates any presented session, logout durably revokes it, and disabled users/role changes take effect on subsequent requests. Production cookies use HttpOnly, Secure, SameSite=Lax, Path=/, no Domain and the __Host- prefix. Local HTTP uses a separate development cookie name. No auth tokens are placed in browser localStorage.

CSRF tokens are derived with HMAC from the private AUTH_SECRET and raw session token; only their hashes are stored. Every authenticated mutation checks the session token's matching CSRF hash. All mutations, including login, require exact configured Origin and JSON; CORS grants only that origin. Secrets and API results are never cached.

## Durable throttling and logging

Identity and address buckets use HMAC identifiers and transactional counters in MySQL. A fixed 15-minute window allows five identity attempts and thirty address attempts, including successful attempts. Parallel requests serialize counter updates; no in-memory limiter is authoritative. The Vercel runtime trusts one known proxy hop; local development ignores forwarded addresses. KDF concurrency limits remain instance-local supplemental protection.

Logging exposes request IDs and safe error/driver codes, not SQL, bodies or credentials. Audits store authorized actors and before/after record values transactionally; salary/PII-bearing audit data is not exposed through an API in these phases. Auth attempt rows contain HMAC identifiers only.

Run `npm run auth:cleanup` administratively to delete at most 5000 expired records per table per invocation: attempts older than seven days, expired throttle windows older than one day, and sessions expired for a day. Audit history is retained. Schedule maintenance operationally before production; no scheduler was installed here.

## Database privilege boundary

`app:setup` generates a dedicated local runtime account, distinct from MYSQL_USER/MYSQL_PASSWORD used for administration. It has reads on necessary modern identity/record tables, a restricted employee lookup projection, permitted INSERT/UPDATE columns for entity/session work, auth metadata writes and audit INSERT only.

In particular it cannot UPDATE balances, INSERT a supplied balance, change account ownership/type/open dates, DELETE customer/account/branch records, alter opening snapshots, modify roles/users/passwords, access payroll or mutate legacy source tables. These restrictions were exercised against MySQL, not only mocked. Grant declarations are in server/scripts/setup.ts. Existing administrator/root grants were not weakened or changed.

Local development grants cover the application and isolated test schemas. Cloud preview/production must have separate accounts scoped to one environment each. Legacy reporting access is not granted yet; future reporting requires an explicit SELECT-only grant. Neither frontend builds nor API cold starts run migrations.

## Scope limits

No public registration, MFA, account-recovery email or self-service password change. Administrator-managed password reset and user provisioning are available. Administrative compromise is outside the API privilege boundary: database owners can edit tables. Imported incomplete employees remain explicitly unknown; imported frozen accounts require a future controlled review workflow. No cloud security/load test or interactive browser QA was completed.

References: [Express security guidance](https://expressjs.com/en/advanced/best-practice-security/), [Vercel pool lifecycle guidance](https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute). The implementation uses database-backed opaque sessions rather than Express's default in-memory session storage.

## Phases 3, 6 and 7 security boundary

The runtime account now has employee and payroll read/column-limited write rights, financial-history/audit read rights and public financial routine EXECUTE. API role enforcement remains mandatory because all signed-in users share this trusted server database identity. A caller who steals the database credential can impersonate an actor parameter; procedures do not claim to solve credential compromise. Keep `.env` server-only and use restricted provider network/TLS controls.

Financial procedures own transactions, validate active actors/permissions, lock accounts deterministically and preserve atomic history/audit/request results. Only known rolled-back lock conflicts are automatically retried with the same key. Public routine parameters are bound values; helper procedures have no runtime execute grants. Posted transactions/transfers, processed payroll and financial audit/request history cannot be rewritten through normal SQL DML. Root/migration access can still alter schema objects and must remain administrative.

Payroll editors become the preparer. Approval/rejection requires a different authorized user, and processing rechecks approval, reviewer access and active employment. Backend arithmetic is exact DECIMAL; frontend preview uses BigInt cents. All financial API mutations have CSRF, Origin, validation and role checks. Unknown MySQL messages are never returned.

Pending posting and processing payloads (not authentication secrets) live in user-scoped browser sessionStorage to preserve retry identity after an uncertain result. The request keys are not authorization tokens. No external payment execution is implemented.

## Phases 8 and 9 security boundary

Dashboard payloads include only authorized financial domains. Reports check view permissions and exports additionally check export permissions. CSV text neutralizes leading spreadsheet formulas and quotes embedded separators/newlines. The 5,000-row cap returns a validation error without partial output. Exports record actor, filters and row count, without copying report contents into audit events.

User mutations atomically commit hashed credentials, role assignments and safe audit fields. Every mutation acquires a per-schema advisory lock on its database connection, then rechecks the actor's active authority. Version conflicts, self-lockout and loss of the last active administrator are rejected. Existing sessions are revoked after access changes/password resets. Role definitions and permissions cannot be edited through the UI. Database owners can still bypass application rules; the runtime credential remains a trusted server secret.
