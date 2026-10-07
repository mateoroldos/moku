# Verified identity and tenant-safe tasks

Issue: [#8](https://github.com/mateoroldos/moku/issues/8) · Appetite: ~8 PRs

## ⚠️ Needs you

- Before deployment verification: confirm the Cloudflare sender, Node hosting, and trusted proxy. Railway is tentative; hosting does not block adapter implementation.

## Trunk path

No PR removes the working inbox. Drafts ship before organization switching so unfinished feedback survives navigation.

| PR  | Trunk gains                               | Users see                       | Approach                | Done    |
| --- | ----------------------------------------- | ------------------------------- | ----------------------- | ------- |
| 1   | Auth tables and one scoped pool           | Existing inbox                  | known                   | ✅ #14  |
| 2   | Seeded login protects read and answer     | Working inbox after login       | known                   | ✅ #18  |
| 3   | Tenant scope, role policy, attribution    | Scoped inbox and answers        | known                   | ✅ #19  |
| 4   | Tab-local feedback drafts                 | Return to unfinished feedback   | known                   | ✅ #20  |
| 5   | Organization chooser and sidebar switcher | Switch seeded organizations     | known                   | ✅ #21  |
| 5a  | Official generated UI source              | Existing organization sidebar   | known · review complete | ✅ main |
| 6   | Organization creation                     | Create org → inbox              | approved · implemented  | ✅ #22  |
| 7   | Signup, email links, console email        | Verify email → app → create org | revised · implemented   | ✅ #23  |
| 8   | Cloudflare email; plan deleted; #8 closed | Links arrive in a real inbox    | implemented             |         |

## Design: PR 7 onboarding and email (approved)

- **Email port and Layers:** keep authentication copy separate from delivery transport so PR 8 can replace console delivery without changing the auth flow.
- Inline sender: fewer lines, but mixes authentication and delivery configuration.
- Durable outbox: adds storage, a worker, retries, and crash/concurrency tests without an approved durability requirement.

Follow [authentication boundaries](../apps/web/docs/authentication.md) for the accepted pre-launch credential-ownership risk, delivery outcomes, and reset failures.

```text
Signup → verification link → app
Unverified sign-in → request verification link → app
Forgot password → reset link → new password → sign in
```

Use Better Auth's standard email links to avoid retaining signup credentials or composing verification from password reset. Pages own navigation and page transitions; forms own submission feedback and report outcomes when the page must react.

Use Show/Hide instead of a repeat-password field to reduce typing. Email verification signs the user in where they open the link; password recovery requires explicit sign-in afterward.

Use synchronous delivery with explicit resend rather than automatic retries or an outbox. Accept request latency, account-existence timing differences, and possible crash loss. PR 8 makes Cloudflare the default; [console delivery](../README.md#develop) remains an explicit local-development choice.

Sources: [Better Auth email and password](https://www.better-auth.com/docs/authentication/email-password) and [Cloudflare limits](https://developers.cloudflare.com/email-service/platform/limits/).

## Design: PR 8 Cloudflare email (approved)

Follow precedent `adapters/database-postgres` for the workspace boundary. Core owns the email contract; the Cloudflare adapter implements it; web selects the implementation.

```text
packages/core/src/email.ts
  Email.Service, Message, Unavailable
adapters/email-cloudflare/
  Cloudflare HTTP transport, response decoding, failure translation
apps/web/src/lib/server/auth-provider.ts
  Verification and password-reset email copy
apps/web/src/lib/server/runtime.ts
  Email Layer selection and configuration
```

The adapter depends on core, never web. Following `adapters/database-postgres/src/postgres-connection.ts`, web parses environment configuration and passes typed options to `EmailCloudflare.layer({ accountId, token, from })`. The adapter owns credential use and provider response types.

Use [Cloudflare REST](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/) from Node through Effect HttpClient. Require the recipient in `delivered` or `queued`, not just HTTP 200; other outcomes become `Email.Unavailable`. Preserve synchronous delivery and explicit resend.

Keep safe failure categories and HTTP status in adapter diagnostics, not the core error contract. Retain redacted causes and suppress the HTTP client's raw failure span; the email-operation span remains. Use a bare sender email address, the documented REST string form.

Confirm the Cloudflare sender, account access, Node host, and trusted proxy during deployment verification.

Cloudflare is the default delivery implementation. Explicit `EMAIL_DELIVERY=console` preserves local development without provider credentials; `.env.example` opts into it. Provider configuration is required only when Cloudflare is selected.

Proof: retain existing authentication integration coverage, exercise provider acceptance and failure translation at the adapter boundary, run workspace/type checks and the production build, then verify real verification/reset links through deployed HTTPS and the trusted proxy. Delete this plan and close #8 only after the deployment proof is complete.

## Decided

- Generated UI restoration and its check suppressions have completed user review. Keep official component families/APIs intact; approved diagnostic suppressions are separate from generated implementation. Application behavior belongs in consumers.
- Follow [authentication boundaries](../apps/web/docs/authentication.md) for protected entrypoints, role capabilities, and transactional writes. Membership snapshots never authorize navigation destinations; live updates belong to #10.
- Keep the organization picker visible with one membership. PR 6 adds a working creation entry for zero, one, and multiple memberships.
- PR 5 may exceed 400 lines for imported shadcn-svelte primitives and dependencies; application logic remains a focused slice.
- Tab-local drafts use [session storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage) over server persistence. Kit owns live form state; the web adapter owns stored feedback and user-scoped cleanup. Storage failure cannot block answering.
- Session storage survives reloads but is not durable or synchronized. Duplicated/opener tabs can start with copies; sign-out cleanup applies to the current tab.
- Better Auth over custom credentials: authentication is not Moku's product. Better Auth owns identity/membership storage; Moku owns task permissions.
- Organization IDs in URLs over readable slugs: sufficient for routing and access checks.
- Reset disposable development data over compatibility migrations. One process-owned database pool serves provider and tasks; [PostgreSQL persistence](../adapters/database-postgres/README.md) owns transactions.

## Risks

- Better Auth membership writes do not join Effect transactions; #10 must preserve write ordering.
- Deployed HTTPS/trusted-proxy verification belongs to PR 8.
