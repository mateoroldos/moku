# Authentication boundaries

For account seeding and server configuration, see [setup](../../../README.md#develop).

The hook allocates a lazy `locals.authenticate` Effect for each request. Its first
consumer resolves a domain `Principal`, absence, or an unavailable error; concurrent
and later consumers share that result. Requests that never consume identity skip
the lookup. Better Auth also skips session storage without a valid session cookie.
Login/signout changes are reflected on the next request.

Protected entrypoints call `AuthGuard.requireVerified(locals.authenticate)`. A principal
identifies the caller; it does not prove verification or grant task permissions.
Layout loads can be reused during client navigation, so each protected remote needs
its own guard. Core owns principal verification and task permissions; the web guard
delegates verification to that policy and owns login redirects.

Neither the organization URL nor Better Auth's active organization grants access.
Map `Access.NotFound` to 404, never 403, so outsiders cannot discover organizations
or tasks; viewers who attempt writes get 403 (`Access.Denied`).
Derive UI capabilities from the [task permissions](../../../packages/core/src/human-task/human-task-directory.ts)
rather than maintaining a separate role policy. Membership checks and scoped task
queries protect different boundaries; completion fallback reads need both too.

Write authorization must use uncached membership on the task write's Effect SQL
transaction. Lock membership before task rows and keep external calls outside the
transaction. A write that locks membership first may finish before removal or
demotion; if the membership change commits first, the write must observe it.
Reads check membership without holding it stable through the task lookup.

The [auth route](../src/routes/api/auth/[...path]/+server.ts) restricts the exposed
provider endpoints. Better Auth owns CSRF checks against the configured origin,
including its trusted Referer fallback. Authenticated HTML needs its own `no-store`
header; the provider's session-response header does not protect rendered task data.

The provider's IP header is overwritten with Kit's transport address for throttling.
Do not trust caller-supplied forwarding headers; proxy configuration must match the
deployment. Unexpected provider errors propagate to the Effect boundary for redacted
diagnostics and safe responses.

Native signout attempts server deletion and clears the browser cookie even when
storage fails. A copied token can remain valid until expiry after failed deletion.
