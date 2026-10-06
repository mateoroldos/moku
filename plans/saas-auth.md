# Verified identity and tenant-safe tasks

Issue: [#8](https://github.com/mateoroldos/moku/issues/8) · Appetite: ~8 PRs

## ⚠️ Needs you

- Before PR 8: confirm the Cloudflare sender, Node hosting, and trusted proxy.

## Trunk path

No PR removes the working inbox. Drafts ship before organization switching so unfinished feedback survives navigation.

| PR  | Trunk gains                               | Users see                              | Approach                | Done    |
| --- | ----------------------------------------- | -------------------------------------- | ----------------------- | ------- |
| 1   | Auth tables and one scoped pool           | Existing inbox                         | known                   | ✅ #14  |
| 2   | Seeded login protects read and answer     | Working inbox after login              | known                   | ✅ #18  |
| 3   | Tenant scope, role policy, attribution    | Scoped inbox and answers               | known                   | ✅ #19  |
| 4   | Tab-local feedback drafts                 | Return to unfinished feedback          | known                   | ✅ #20  |
| 5   | Organization chooser and sidebar switcher | Switch seeded organizations            | known                   | ✅ #21  |
| 5a  | Official generated UI source              | Existing organization sidebar          | known · review complete | ✅ main |
| 6   | Organization creation                     | Create org → inbox                     | approved · implemented  | ✅ #22  |
| 7   | Signup, email code, console email         | Confirm password → create org → review | revised · implemented   | #23     |
| 8   | Cloudflare email; plan deleted; #8 closed | Code arrives in a real inbox           | deployment verification |         |

## Design: PR 7 onboarding and email (approved)

- **Email port and Layers:** one web-owned capability; AuthProvider owns verification copy, delivery Layers own transport.
- Inline sender: fewer lines, but mixes authentication and delivery configuration.
- Durable outbox: adds storage, a worker, retries, and crash/concurrency tests without an approved durability requirement.

```text
AuthProvider.handle(request, clientAddress): Effect<Response, AuthProvider.Unavailable>
  └─ Better Auth stores account/code → sendVerificationOTP: Promise<void>
       └─ Effect.runPromiseWith(providedContext) → Email.send(message): Effect<void, Email.Unavailable>
            failure → safe diagnostic; Better Auth catches rejection and can return success
```

For pre-release PR 7, `runtime.ts` supplies console delivery in every environment. Console output deliberately unwraps the message and bypasses telemetry; PR 8 supplies Cloudflare production delivery.

Use hashed OTP storage and default rotation. Signup completion uses Better Auth's OTP password-reset transition: proof of mailbox ownership replaces any pre-existing password before verifying the account. Verification-only activation preserves an attacker-supplied password after duplicate signup and is blocked, along with OTP sign-in and email-change endpoints.

Minimal password recovery moves forward from #9: request/reset endpoints support both onboarding and recovery, revoke prior sessions, then ordinary password sign-in opens `/`. Password replacement precedes verification; the provider does not wrap all reset writes in one transaction. After uncertain completion, try signing in before requesting another code.

SignupForm retains the intended password only in component memory through the code step. VerifyEmailForm owns completion, requests, countdown, and feedback; standalone recovery collects a new password. Refresh resumes through password recovery. Routes own page composition. No passwords enter URLs, browser storage, or navigation state.

Await sending and report safe failures before Better Auth catches them. Accept request latency, account-existence timing differences, and possible crash loss; offer resend without automatic retries or delivery receipts.

Code requests use a 60-second UI wait and an endpoint/IP rule on `/email-otp/request-password-reset`. Signup and login send no codes implicitly. An unverified login opens completion with the request button available. Use official shadcn-svelte InputOTP with six slots, numeric filtering, one-time-code autofill, and explicit submission; Bits UI owns input behavior.

PR 8 uses [Cloudflare REST](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/) from Node through Effect HttpClient. Require the recipient in `delivered` or `queued`, not just HTTP 200; other outcomes become `Email.Unavailable`. Confirm sender onboarding, account access, and live delivery then.

| Proof                                                                            | Owner and regression caught                                                                                                             |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Attacker signup → owner signup → code + owner password → authenticated principal | Real PostgreSQL and capturing Email Layer: old password fails, owner's password works, implicit sends cannot bypass request throttling. |
| Recovery revokes the previous session                                            | Same fixture with an already-verified user; catches missing session revocation wiring.                                                  |
| Failing Email Layer emits a diagnostic despite successful HTTP response          | Same fixture; catches silent send failure at the bridge.                                                                                |
| Signup, verification, resend wait, validation, and navigation                    | Running app, including keyboard, mobile/desktop, light/dark. Proves the new entrypoints and user-visible states.                        |

Sources: installed Effect **4.0.0-rc.112** and Better Auth **1.7.4**; [OTP plugin](https://www.better-auth.com/docs/plugins/email-otp), [InputOTP](https://shadcn-svelte.com/docs/components/input-otp), and [Cloudflare limits](https://developers.cloudflare.com/email-service/platform/limits/).

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
