# Verified identity and tenant-safe tasks

Issue: #8 · Appetite: ~8 PRs

A teammate signs in and reads, creates, and answers only their organization's tasks; a new person signs up, verifies their email, and creates an organization. PR 3 scopes the privately seeded inbox by organization; public signup follows later.

Not: password recovery and sessions (#9), invitations and members (#10), guests (#11), deletion and invite-only (#12); social login, MFA, SSO, billing, machine API keys.

## ⚠️ Needs you

- Review [PR #19](https://github.com/mateoroldos/moku/pull/19): tenant scope, role policy, and attribution.
- Email: approve sending while the person waits, with a resend button, over a durable queue? Simpler; a crash can lose one email.
- Before PR 8: confirm the Cloudflare sender, Node hosting, and the trusted proxy.

## Trunk path

No PR removes the working inbox.

| PR  | Trunk gains                                      | Users see                    | Technique                         | Undo                              | Mode | Done   |
| --- | ------------------------------------------------ | ---------------------------- | --------------------------------- | --------------------------------- | ---- | ------ |
| 1   | Auth tables and one scoped pool for both drivers | Existing inbox               | contract first · keystone in PR 2 | revert code; retain unused tables | ask  | ✅ #14 |
| 2   | Seeded login protects read and answer            | Working inbox after login    | skeleton · live                   | revert                            | ask  | ✅ #18 |
| 3   | Tenant scope, role policy, attribution           | Scoped inbox and answers     | skeleton · live                   | revert, reset dev data            | ask  |        |
| 4   | Task creation in the app                         | Create → review → answer     | split · live                      | revert                            | ask  |        |
| 5   | Organization list and switcher                   | Switch seeded organizations  | split · live                      | revert                            | ask  |        |
| 6   | Organization creation                            | Create org → inbox           | split · live                      | revert                            | ask  |        |
| 7   | Signup, email code, console email                | Verify → create org → review | split · live                      | revert                            | ask  |        |
| 8   | Cloudflare email; docs; plan deleted; #8 closed  | Code arrives in a real inbox | split · live                      | revert; sent mail stays           | ask  |        |

Later: [#9 Account security](https://github.com/mateoroldos/moku/issues/9), [#10 Team membership](https://github.com/mateoroldos/moku/issues/10), [#11 External review](https://github.com/mateoroldos/moku/issues/11), [#12 Lifecycle and production](https://github.com/mateoroldos/moku/issues/12)

## Rules

- Follow [authentication boundaries](../apps/web/docs/authentication.md) when adding protected entrypoints.
- Logs and events never hold passwords, codes, tokens, or email bodies; production refuses to start with console email.

## PR 3 design

- Transactional write authorization over request-snapshot membership: removal and demotion must have a deterministic order relative to task writes. The contract lives in [authentication boundaries](../apps/web/docs/authentication.md).
- Core creation authorization belongs in this slice; creation UI belongs in PR 4 and organization selection in PR 5.

### Assumed

- Organization IDs in URLs are sufficient for this slice; readable slugs and a switcher are not required to establish access.

## Risks

- Deployed HTTPS and trusted-proxy behavior require verification in PR 8.
- Better Auth membership writes do not join Effect transactions; membership management in #10 must preserve the write-ordering contract.
- Waiting for email may reveal whether an account exists through response time → measure before PR 7.

## Decisions

- Better Auth over our own: credentials and sessions aren't our product, and `../effect-forge` already runs it with our Effect version.
- Better Auth stores accounts, sessions, codes, and memberships; Moku owns task permissions. No second membership table.
- Seeded accounts before signup over signup first: the protected inbox works from PR 2.
- Replacing the task schema and resetting dev data over a migration: there are no users yet.
- Email code: six digits, five minutes, three tries, single use, stored hashed; resend waits 60 seconds.
- Console email in development, Cloudflare in production, behind one email port.
- One process-owned database pool over Forge's separate client: provider and task storage share resource ownership. See [PostgreSQL persistence](../adapters/database-postgres/README.md) for transaction boundaries.

## References

| Source                                                                                                                                                         | Use it for                                                  | Trust     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------- |
| `adapters/database-postgres/node_modules/better-auth` 1.7.4                                                                                                    | what the provider really does: cookies, hooks, transactions | truth     |
| [Better Auth: SvelteKit](https://www.better-auth.com/docs/integrations/svelte-kit)                                                                             | wiring the handler and session into hooks                   | truth     |
| [Better Auth: email OTP](https://www.better-auth.com/docs/plugins/email-otp) and [organization](https://www.better-auth.com/docs/plugins/organization) plugins | code options and membership endpoints to enable or deny     | truth     |
| [Cloudflare Email Service](https://developers.cloudflare.com/email-service/)                                                                                   | sending from Node over REST; account and sender setup       | truth     |
| `../effect-forge/apps/web/src/lib/server/authentication.ts`, `apps/web/docs/authentication.md`                                                                 | Better Auth with Effect and SvelteKit; no OTP or email      | precedent |
| `../effect-forge/packages/core/src/organization-access/`                                                                                                       | decoding membership, permission checks, inaccessible orgs   | precedent |
