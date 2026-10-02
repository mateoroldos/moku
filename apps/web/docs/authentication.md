# Authentication

Verified accounts can read and answer the shared pre-release inbox. Public signup
is disabled. Seed accounts using the [root setup](../../../README.md#develop).
Organization scope, roles, and attribution come in the next auth slice.

## Request boundary

```text
handle → locals.run → Authentication.Service.authenticate(headers)
  → locals.auth: Result<User | null, Authentication.Unavailable>
  → resolve(event)
    → protected layout or remote → locals.run(name, Effect)
      → AuthGuard.requireVerified(locals) → task operation
    → typed Result → Kit redirect/error
```

Every protected remote must call the guard; a layout check does not authorize
remote calls. Request locals share one session lookup, including concurrent
consumers. New requests see revocation and identity changes. Provider failures
remain unavailable errors, distinct from absent identity.

The hook resolves identity for every dynamic request before calling `resolve`.
Better Auth returns absent identity without reading session storage when there is
no valid session cookie. Public consumers can ignore an unavailable result;
requests carrying a session cookie still wait for the lookup. The snapshot describes
the incoming request; login/signout changes are observed on the next request.

The shared runtime owns authentication and one scoped PostgreSQL pool. Each
protected entrypoint enforces access using the hook's result. Layout loads may be
reused on client navigation; they do not replace guards in remotes. Future
membership checks for writes belong inside the task transaction.
Authenticated layout responses use `private, no-store`.

## Provider boundary

The Kit auth route allows only these operations before calling the provider service:

- `POST /api/auth/sign-in/email`
- `POST /api/auth/sign-out`
- `GET /api/auth/get-session`

Better Auth sets `Cache-Control: no-store` on session responses. The route preserves
that header; the POST responses do not enable caching.

`ORIGIN` must match the browser scheme, host, and port at both build and startup.
HTTPS is required except for `localhost`, `127.0.0.1`, and `[::1]`. Auth POSTs
require that exact Origin; provider and Kit CSRF checks remain enabled.
Cookies are host-only, HttpOnly, SameSite=Lax, and Secure with HTTPS.
The login page creates seven-day sessions without sliding renewal or cookie caching.
Provider callers selecting `rememberMe: false` receive a shorter, 24-hour session.

`handle(request, clientAddress)` overwrites the provider's IP header with Kit's
transport address for rate limiting. Caller IP and forwarded headers are not
trusted. Trusted-proxy deployment configuration remains a deployment decision.

Signout uses native Better Auth behavior: attempt server-side deletion, then clear
the browser cookie even if storage fails. Success confirms browser signout, not
server revocation during an outage; a copied token may remain valid until expiry.
Propagated provider failures become sanitized 503 responses with redacted causes.

## Verification owners

- `auth-guard.test.ts`: identity policy over the resolved request result.
- `authentication.integration.ts`: real provider/storage, expiry, outage translation,
  cookie-less lookup during outages, native signout integration, origin restrictions,
  transport-address throttling.
- Real Kit/browser checks: auth endpoint allowlist and session cache headers,
  protected list/read/answer calls (including a spoofed
  `x-sveltekit-pathname`), cookie integration, login → review → signout, and visible failures.

Provider integration tests run in production mode because Better Auth bypasses
origin checks and throttling in test mode. Existing database/runtime tests own
pool lifetime, transactions, and persistence.
