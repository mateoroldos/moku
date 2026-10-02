# Verified identity and tenant-safe tasks

Issue: #8 · Appetite: ~8 PRs

A teammate signs in and reads, creates, and answers only their organization's tasks; a new person signs up, verifies their email, and creates an organization. Today anyone can read and answer every task.

Not: password recovery and sessions (#9), invitations and members (#10), guests (#11), deletion and invite-only (#12); social login, MFA, SSO, billing, machine API keys.

## ⚠️ Needs you

- Before PR 3: size tenant enforcement; split anything over about 400 handwritten lines here first.
- Email: approve sending while the person waits, with a resend button, over a durable queue? Simpler; a crash can lose one email.
- Before PR 8: confirm the Cloudflare sender, Node hosting, and the trusted proxy.

## Trunk path

No PR removes the working inbox.

| PR  | Trunk gains                                      | Users see                    | Technique                         | Undo                              | Mode | Done   |
| --- | ------------------------------------------------ | ---------------------------- | --------------------------------- | --------------------------------- | ---- | ------ |
| 1   | Auth tables and one scoped pool for both drivers | Existing inbox               | contract first · keystone in PR 2 | revert code; retain unused tables | ask  | ✅ #14 |
| 2   | Seeded login protects read and answer            | Working inbox after login    | skeleton · live                   | revert                            | ask  |        |
| 3   | Tenant scope, role policy, attribution           | Scoped inbox and answers     | skeleton · live                   | revert, reset dev data            | ask  |        |
| 4   | Task creation in the app                         | Create → review → answer     | split · live                      | revert                            | ask  |        |
| 5   | Organization list and switcher                   | Switch seeded organizations  | split · live                      | revert                            | ask  |        |
| 6   | Organization creation                            | Create org → inbox           | split · live                      | revert                            | ask  |        |
| 7   | Signup, email code, console email                | Verify → create org → review | split · live                      | revert                            | ask  |        |
| 8   | Cloudflare email; docs; plan deleted; #8 closed  | Code arrives in a real inbox | split · live                      | revert; sent mail stays           | ask  |        |

Later: [#9 Account security](https://github.com/mateoroldos/moku/issues/9), [#10 Team membership](https://github.com/mateoroldos/moku/issues/10), [#11 External review](https://github.com/mateoroldos/moku/issues/11), [#12 Lifecycle and production](https://github.com/mateoroldos/moku/issues/12)

## Shape

```text
packages/domain/src/      + identity/        UserId, Principal
                          + organization/    OrganizationId, OrganizationRole
                          ~ human-task/      TaskRef { organizationId, taskId }, ResponseAttribution
packages/core/src/        + access/          VerifiedPrincipal, role policy, membership port
                          ~ human-task/      directory and store take (principal, TaskRef)
adapters/database-postgres/src/  + auth/     AuthStorage.Service (Better Auth factory), four-table schema
                                + postgres-connection.ts  PostgresConnection.layer(options) → PgClient + AuthStorage.Service
                          ~ human-task/      tasks.organization_id required, scoped SQL
apps/web/src/             ~ hooks.server.ts  allocate lazy request-local identity
                          + lib/server/authentication.ts  shared provider service
                          + lib/server/auth-guard.ts  verified identity policy
                          ~ lib/features/human-tasks/human-tasks.remote.ts  session + TaskRef
                          + routes/login, routes/[org]/…  login, scoped inbox and tasks
```

```diff
 respondToHumanTask(form): web remote
+  ├─ session → VerifiedPrincipal → AuthenticationRequired | EmailUnverified
-  └─ directory.respond(id, answer)
+  └─ directory.respond(principal, { organizationId, taskId }, answer)
+       ├─ membership and role, read in the transaction → TaskAccessError
+       └─ scoped completion + attribution → AlreadyCompleted | StoreUnavailable
```

## Rules

- Every task belongs to exactly one organization, and every read, list, create, and answer is limited to it.
- The server decides who you are and your role; IDs or roles sent by the browser are never trusted.
- Signed-out, unverified, outsider, and viewer-writing requests are refused, including direct calls that skip the UI.
- Someone outside the organization gets "not found", never "forbidden", so tasks can't be discovered.
- A removed member loses access on their next request; every write rechecks membership inside its transaction.
- The first answer wins and records who answered and with which role.
- If an identity lookup fails, protected operations say unavailable; they never treat the failure as absence or let you in. Explicit signout follows native provider semantics below.
- Logs and events never hold passwords, codes, tokens, or email bodies; production refuses to start with console email.

## Risks

- SvelteKit 3 next.30 handler and cookie behavior needs a real app check in PR 2; the PostgreSQL spike proves Better Auth 1.7.4 with Drizzle rc.5 and Effect rc.112, not Kit integration.
- Better Auth membership writes escape Effect transactions even on the same pool → keep membership endpoints disabled; PR 3 must check membership and write tasks through the same Effect transaction.
- Waiting for email may reveal whether an account exists through response time → measure before PR 7.

## Decisions

- Better Auth over our own: credentials and sessions aren't our product, and `../effect-forge` already runs it with our Effect version.
- Better Auth stores accounts, sessions, codes, and memberships; Moku owns task permissions. No second membership table.
- One role per membership: owner, admin, member, viewer. Viewers read; the others also create and answer.
- The organization comes from the URL over a saved "active organization", which never grants access.
- Seeded accounts before signup over signup first: the protected inbox works from PR 2.
- Replacing the task schema and resetting dev data over a migration: there are no users yet.
- Email code: six digits, five minutes, three tries, single use, stored hashed; resend waits 60 seconds.
- Console email in development, Cloudflare in production, behind one email port.
- Keep the process-owned database pool over Forge's separate client; never cast the Effect client to a Promise client.
- Sessions expire seven days after login by default (24 hours with native `rememberMe: false`), with no sliding renewal or cookie cache.
- PR 2 uses privately seeded verified accounts and a globally shared inbox, without public signup or a whitelist. Login returns to `/`; tenant scope and attribution wait for PR 3.
- One `ORIGIN` matches the browser at build and startup. Use native provider/Kit CSRF checks, including the provider's trusted Referer fallback. Cookies are host-only, HttpOnly, SameSite=Lax, and Secure on HTTPS; HTTP is allowed only on loopback hosts.
- Caller-supplied IP/forwarded headers are untrusted. Authentication uses Kit's transport address for provider throttling; trusted-proxy hosting is decided in PR 8.
- Use native Better Auth signout: attempt server revocation and clear the browser cookie even when storage fails. Prefer provider semantics over a custom confirmed-revocation endpoint; a copied token may remain valid until expiry after failed deletion.
- PR 2 establishes domain-owned `Principal` and `UserId`; a principal identifies the caller without granting permissions. The hook allocates lazy request-local identity and entrypoints enforce access as described in [authentication boundaries](../apps/web/docs/authentication.md). PR 3 brings principals into core authorization.
- PR 1 uses web-owned Better Auth options and CLI config to generate `user`, `account`, `session`, and `verification` in the database adapter, then Drizzle generates SQL/snapshot. Runtime auth must consume the same options in PR 2. Existing task behavior remains; no auth endpoints or accounts are enabled.
- `WebRuntime.layer` supplies `PostgresConnection.layer` with URL and application name. It acquires one scoped pool and exposes `PgClient.fromPool` plus `AuthStorage.Service`; raw pool and Drizzle clients stay private. Pool closure waits for borrowed clients after consumers finish.

## References

| Source                                                                                                                                                         | Use it for                                                  | Trust     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------- |
| `adapters/database-postgres/node_modules/better-auth` 1.7.4                                                                                                    | what the provider really does: cookies, hooks, transactions | truth     |
| [Better Auth: SvelteKit](https://www.better-auth.com/docs/integrations/svelte-kit)                                                                             | wiring the handler and session into hooks                   | truth     |
| [Better Auth: email OTP](https://www.better-auth.com/docs/plugins/email-otp) and [organization](https://www.better-auth.com/docs/plugins/organization) plugins | code options and membership endpoints to enable or deny     | truth     |
| [Cloudflare Email Service](https://developers.cloudflare.com/email-service/)                                                                                   | sending from Node over REST; account and sender setup       | truth     |
| `../effect-forge/apps/web/src/lib/server/authentication.ts`, `apps/web/docs/authentication.md`                                                                 | Better Auth with Effect and SvelteKit; no OTP or email      | precedent |
| `../effect-forge/packages/core/src/organization-access/`                                                                                                       | decoding membership, permission checks, inaccessible orgs   | precedent |
