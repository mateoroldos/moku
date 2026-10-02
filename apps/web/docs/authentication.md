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
its own guard. Future membership checks for writes belong inside the transaction.

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
