# Verified identity and tenant-safe tasks

Track: big feature + auth/data stakes · Status: shaping · Appetite: ~7 PRs · PRs: 0/7 · Issue: #8

A teammate signs in and reads, creates, and answers only their organization's tasks; a new person signs up, verifies their email, and creates an organization. Today anyone can read and answer every task.
Not: password recovery and sessions (#9), invitations and members (#10), guests (#11), deletion and invite-only (#12); social login, MFA, SSO, billing, machine API keys.

## Needs you

- Approve this plan. The spike sizes PRs 1–2 before any code; anything over about 400 lines gets split here first.
- Session lifetime: approve a fixed seven days, with no sliding renewal?
- Email: approve sending while the person waits, with a resend button, over a durable queue? Simpler; a crash can lose one email.
- Before PR 7: confirm the Cloudflare sender, Node hosting, and the trusted proxy.

## Shape

New names are proposals; the spike may change them.

```text
packages/domain/src/      + organization/    UserId, OrganizationId, OrganizationRole
                          ~ human-task/      TaskRef { organizationId, taskId }, ResponseAttribution
packages/core/src/        + access/          VerifiedPrincipal, role policy, membership port
                          ~ human-task/      directory and store take (principal, TaskRef)
adapters/database-postgres/src/  + auth/     Better Auth users, sessions, organizations
                          ~ human-task/      tasks.organization_id required, scoped SQL
apps/web/src/             ~ hooks.server.ts  session → request-local principal
                          + lib/server/auth  Better Auth bridge, permitted operations
                          ~ features/human-tasks/human-tasks.remote.ts  session + TaskRef
                          + routes/login, routes/[org]/…  login, scoped inbox and tasks
```

Answering a task; every task remote follows the same path:

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
- If auth or the database is down, the app says unavailable; it never signs you out or lets you in.
- Logs and events never hold passwords, codes, tokens, or email bodies; production refuses to start with console email.

## Risks

- Better Auth 1.7.4 may not fit SvelteKit 3 next.30, our Drizzle version, or our process-owned pool → spike in scratch files before PR 1.
- Better Auth's membership writes may not join our transactions, which would break the removed-member rule → prove it in the spike; its membership endpoints stay disabled until then.
- Waiting for email may reveal whether an account exists through response time → measure it in the spike, before PR 6.

## Trunk path

No PR removes the working inbox.

| PR  | Trunk gains                                     | Users see                    | Technique       | Undo                    | Mode | Status   |
| --- | ----------------------------------------------- | ---------------------------- | --------------- | ----------------------- | ---- | -------- |
| 1   | Seeded login protects read and answer           | Working inbox after login    | skeleton · live | revert                  | ask  | proposed |
| 2   | Tenant scope, role policy, attribution          | Scoped inbox and answers     | skeleton · live | revert, reset dev data  | ask  | proposed |
| 3   | Task creation in the app                        | Create → review → answer     | split · live    | revert                  | ask  | proposed |
| 4   | Organization list and switcher                  | Switch seeded organizations  | split · live    | revert                  | ask  | proposed |
| 5   | Organization creation                           | Create org → inbox           | split · live    | revert                  | ask  | proposed |
| 6   | Signup, email code, console email               | Verify → create org → review | split · live    | revert                  | ask  | proposed |
| 7   | Cloudflare email; docs; plan deleted; #8 closed | Code arrives in a real inbox | split · live    | revert; sent mail stays | ask  | proposed |

Later: [#9 Account security](https://github.com/mateoroldos/moku/issues/9), [#10 Team membership](https://github.com/mateoroldos/moku/issues/10), [#11 External review](https://github.com/mateoroldos/moku/issues/11), [#12 Lifecycle and production](https://github.com/mateoroldos/moku/issues/12)

## Decisions

- Better Auth over our own: credentials and sessions aren't our product, and `../effect-forge` already runs it with our Effect version.
- Better Auth stores accounts, sessions, codes, and memberships; Moku owns task permissions. No second membership table.
- One role per membership: owner, admin, member, viewer. Viewers read; the others also create and answer.
- The organization comes from the URL over a saved "active organization", which never grants access.
- Seeded accounts before signup over signup first: the inbox works from PR 1.
- Replacing the task schema and resetting dev data over a migration: there are no users yet.
- Email code: six digits, five minutes, three tries, single use, stored hashed; resend waits 60 seconds.
- Console email in development, Cloudflare in production, behind one email port.
- Keep the process-owned database pool over Forge's separate client; never cast the Effect client to a Promise client.

## References

| Source                                                                                                                                                         | Use it for                                                  | Trust     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------- |
| `node_modules/better-auth` 1.7.4, once installed                                                                                                               | what the provider really does: cookies, hooks, transactions | truth     |
| [Better Auth: SvelteKit](https://www.better-auth.com/docs/integrations/svelte-kit)                                                                             | wiring the handler and session into hooks                   | truth     |
| [Better Auth: email OTP](https://www.better-auth.com/docs/plugins/email-otp) and [organization](https://www.better-auth.com/docs/plugins/organization) plugins | code options and membership endpoints to enable or deny     | truth     |
| [Cloudflare Email Service](https://developers.cloudflare.com/email-service/)                                                                                   | sending from Node over REST; account and sender setup       | truth     |
| `../effect-forge/apps/web/src/lib/server/authentication.ts`, `apps/web/docs/authentication.md`                                                                 | Better Auth with Effect and SvelteKit; no OTP or email      | precedent |
| `../effect-forge/packages/core/src/organization-access/`                                                                                                       | decoding membership, permission checks, inaccessible orgs   | precedent |
