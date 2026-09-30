# Authentication foundation

Better Auth 1.7.4 uses the relations-v2 Drizzle adapter and the
[generated PostgreSQL schema](../../../adapters/database-postgres/src/auth/schema.ts).
See the [schema workflow](../../../adapters/database-postgres/README.md#authentication-schema)
before changing provider options or plugins.

Better Auth's optional SvelteKit peer range still names Kit 2. Moku's Kit 3
integration uses the native `Request`/`Response` handler instead of the provider's
Kit-specific helpers. Check compatibility separately before introducing those helpers.

## Configure and run

Set `AUTH_ORIGIN` to the exact public origin, without a path, credentials, query,
or fragment. HTTPS is required except for loopback development. Set `AUTH_SECRET`
to a generated secret of at least 32 characters (`openssl rand -base64 32`). Missing
or invalid configuration prevents startup. Builds require neither a secret nor a
database connection. Keep the built SvelteKit `ORIGIN` aligned with `AUTH_ORIGIN`.

Apply migrations before starting the server. The current HTTP surface is:

- `POST /api/auth/sign-in/email`: existing verified email/password accounts only.
- `GET /api/auth/get-session`: database-backed session lookup, or `null` when absent.
- `POST /api/auth/sign-out`: revoke the session and clear its cookie.

Other provider endpoints return 404. Task routes are not protected by this foundation.

## Lifetimes and boundaries

- The Node runtime owns one bounded `pg.Pool`, shared by Effect application SQL
  and the Promise-based auth Drizzle client. Runtime shutdown closes it; requests
  neither create pools nor run migrations.
- A shared provider contains no request identity cache. Each HTTP call resolves
  its own cookies against the database. Never store a viewer in process-global state.
- Sessions have a seven-day maximum lifetime, without sliding renewal or cookie
  caching. With `rememberMe: false`, the provider uses a one-day lifetime and a
  browser-session cookie. Cookies travel in the provider HTTP response unchanged. HTTP endpoints
  do not need the SvelteKit server-action cookie plugin; revisit that integration
  if adding direct provider mutations inside actions/remotes.
- Origin and CSRF checks are explicitly enabled, including in tests. Provider
  rate limits use the database. No forwarded IP headers are trusted: unresolved
  addresses share the provider's per-path bucket. Configure trusted proxy handling
  before public rollout; do not enable arbitrary `X-Forwarded-For` trust.
- Expected auth rejections preserve provider responses. Provider server errors
  become a typed availability failure and a safe HTTP 503. The provider call is
  uninterruptible because its database promises do not support cancellation.

## Verify

`bun run check` runs the [provider](../src/lib/server/authentication.test.ts) and
[configuration](../src/lib/server/auth-config.test.ts) tests.
`bun run test:postgres` runs the [runtime integration tests](../src/lib/server/runtime.integration.ts)
against a migrated disposable database. Shutdown during an in-flight auth request
requires separate verification.
