# Authentication boundaries

For account seeding and server configuration, see [setup](../../../README.md#develop).

The hook allocates a lazy `locals.authenticate` Effect for each request. Its first
consumer resolves a domain `Principal`, absence, or an unavailable error; concurrent
and later consumers share that result. Requests that never consume identity skip
the lookup. Better Auth also skips session storage without a valid session cookie.
Login/signout changes are reflected on the next request.

Protected entrypoints call `AuthGuard.requirePrincipal(locals.authenticate)`. A principal
identifies the caller; it does not prove verification or grant task permissions.
Layout loads can be reused during client navigation, so each protected remote needs
its own guard and core authorization. Core operations own email verification and
permissions; the web guard requires identity, and `AuthGuard.reject` translates
authentication and verification failures to login redirects or HTTP errors.

Neither the organization URL nor Better Auth's active organization grants access.
Map `Access.NotFound` to 404, never 403, so outsiders cannot discover organizations
or tasks; viewers who attempt writes get 403 (`Access.Denied`).
Derive UI capabilities from the [task role policy](../../../packages/core/src/human-task/human-tasks.ts)
rather than maintaining a separate role policy. Membership checks and scoped task
queries protect different boundaries; completion fallback reads need both too.

Server-side organization creation bypasses Better Auth's browser creation restriction.
`Organizations.create` derives the creator from verified request identity, never
caller-supplied input. `OrganizationCreation.createWithOwner` atomically creates
the organization and owner membership through the shared Better Auth instance.
Provider transactions are independent of Effect SQL's task-write transactions.

`OrganizationAccess.withWriteAccess` verifies the principal and checks allowed roles
before running the supplied write. `OrganizationMembershipStore.withLock` owns the
Effect SQL transaction, reading uncached membership and locking it before task rows.
Keep task writes inside the callback and external calls outside it. A write that
locks membership first may finish before removal or demotion; if the membership
change commits first, the write must observe it.
Reads check membership without holding it stable through the task lookup.

The [auth route](../src/routes/api/auth/[...path]/+server.ts) restricts the exposed
provider endpoints. Better Auth owns CSRF checks against the configured origin,
including its trusted Referer fallback. Authenticated HTML needs its own `no-store`
header; the provider's session-response header does not protect rendered task data.

The provider's IP header is overwritten with Kit's transport address for throttling.
Do not trust caller-supplied forwarding headers; proxy configuration must match the
deployment. Unexpected provider errors propagate to the Effect boundary for redacted
diagnostics and safe responses.

Auth success does not confirm email delivery. The email bridge logs send failures,
including those Better Auth catches. Link requests are throttled per endpoint/IP,
not per address.

Better Auth's standard verification links preserve a pre-registered account's password
after duplicate signup. This credential-ownership risk is accepted for pre-launch;
password reset recovers access but does not prevent access before recovery. Reassess
before launch. [Better Auth #11023](https://github.com/better-auth/better-auth/issues/11023)
reports the related OTP case; the link case is also reproduced against 1.7.4.

Password reset revokes existing sessions, but password replacement and revocation are
not one transaction. An uncertain response must offer sign-in with the chosen password
before another reset attempt.

Native signout attempts server deletion and clears the browser cookie even when
storage fails. A copied token can remain valid until expiry after failed deletion.
