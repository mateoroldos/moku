# Authentication boundaries

For account seeding and server configuration, see [setup](../../../README.md#develop).

The hook binds `locals.auth` to a snapshot of the request's headers. The first consumer
of its lazy `authenticate` Effect resolves a domain `Principal`, absence, or an unavailable
error; concurrent and later consumers share that result. Requests that never consume identity skip
the lookup. Better Auth also skips session storage without a valid session cookie.
Login/signout changes are reflected on the next request.

Protected entrypoints use `locals.auth.principal`;
those inside an organization call `locals.auth.membership`, which also resolves
the caller's role from Better Auth. A principal identifies
the caller; it does not prove verification or grant task permissions. Layout loads
can be reused during client navigation, so each protected remote needs its own guard.
Core operations enforce role policy on the membership they receive. `AuthGuard.reject`
translates authentication and verification failures to login redirects or HTTP errors.

Neither the organization URL nor Better Auth's active organization grants access.
Map `Access.NotFound` to 404, never 403, so outsiders cannot discover organizations
or tasks; viewers who attempt writes get 403 (`Access.Denied`).
Derive UI capabilities from the [task role policy](../../../packages/core/src/human-task/human-tasks.ts)
rather than maintaining a separate role policy. Membership checks and scoped task
queries protect different boundaries; completion fallback reads need both too.

`Organizations` resolves roles and lists organizations and their members from Better
Auth with the request's headers; its membership check becomes `Access.NotFound` for outsiders.
`Organizations.create` makes the session owner the owner of a new organization. It is not
atomic: a failed owner write can leave an organization without members.

Login and signup return only to `/invitations/<id>`, from `?invitation=<id>`; never
redirect to a caller-supplied path. The invitation page checks the recipient through
Better Auth; a wrong account sees the unavailable state, with a way to switch accounts.

Better Auth's 100-pending invitation cap is best-effort: expired invitations stay pending and,
past 100 of them, stop the cap counting.

Team shows invitation controls when `organizationRoles` (Better Auth's role objects)
grant the caller's role invitation rights; do not restate that policy in the UI.

Better Auth swallows invitation email failures, so they are only logged; inviting the
address again resends its invitation.

Membership is resolved once per operation and not held during task writes: a member
removed or demoted mid-request can finish that request.

Organization calls allow request cancellation to stop waiting for Better Auth.
The provider's underlying database work may continue until it settles.

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
