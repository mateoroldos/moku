# Verified identity and tenant-safe tasks

Issue: [#8](https://github.com/mateoroldos/moku/issues/8) · Appetite: ~8 PRs

## ⚠️ Needs you

- Before PR 7: approve synchronous email sending with resend over a durable queue; a crash can lose one email.
- Before PR 8: confirm the Cloudflare sender, Node hosting, and trusted proxy.

## Trunk path

No PR removes the working inbox. Drafts ship before organization switching so unfinished feedback survives navigation.

| PR  | Trunk gains                               | Users see                     | Approach                | Done    |
| --- | ----------------------------------------- | ----------------------------- | ----------------------- | ------- |
| 1   | Auth tables and one scoped pool           | Existing inbox                | known                   | ✅ #14  |
| 2   | Seeded login protects read and answer     | Working inbox after login     | known                   | ✅ #18  |
| 3   | Tenant scope, role policy, attribution    | Scoped inbox and answers      | known                   | ✅ #19  |
| 4   | Tab-local feedback drafts                 | Return to unfinished feedback | known                   | ✅ #20  |
| 5   | Organization chooser and sidebar switcher | Switch seeded organizations   | known                   | ✅ #21  |
| 5a  | Official generated UI source              | Existing organization sidebar | known · review complete | ✅ main |
| 6   | Organization creation                     | Create org → inbox            | approved · implemented  |         |
| 7   | Signup, email code, console email         | Verify → create org → review  | design before build     |         |
| 8   | Cloudflare email; plan deleted; #8 closed | Code arrives in a real inbox  | deployment verification |         |

## Design: PR 6 — approved

Issue #8 owns the approved creation experience, short organization URLs, and atomic creation guarantee. Place `/organizations/new` under the authenticated layout, outside the organization-scoped layout.

| Approach                                         | Code, concepts, and proof cost                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Native provider browser endpoint                 | Least bridge code; adds public endpoint, client plugin, input-policy hooks, and HTTP policy coverage                   |
| **Kit remote form → AuthProvider → Better Auth** | One remote and provider adapter; reuses Kit validation and verified guard                                              |
| Application-owned SQL                            | New persistence operation owns provider defaults and membership writes; adds transaction/schema-compatibility coverage |

The provider bridge generates an opaque random slug and calls server-only `auth.api.createOrganization` inside `runWithTransaction(context.adapter, ...)`, with the guarded `userId`, no session headers, and `keepCurrentActiveOrganization: true`. Keep public organization endpoints blocked and `allowUserToCreateOrganization: false`; server-only creation intentionally bypasses that setting. Better Auth owns storage; its transaction context binds the provider's writes, independently of Effect SQL transactions.

```text
createOrganization = form(strict { name }, callback): encoded Organization
  ├─ Effect Schema trims/rejects blank names and extra keys → field issues
  └─ locals.run("Remote.createOrganization", program)
       ├─ AuthGuard.requireVerified(locals.authenticate)
       │    └─ Required → login; Unverified → 403; Unavailable → 503
       └─ AuthProvider.createOrganization(userId: UserId, name: string)
            : Effect<Organization, AuthProvider.Unavailable>
            ├─ runWithTransaction → provider inserts organization + owner; failure rolls back
            └─ decode Organization; provider/decode failure → redacted Unavailable → 503
enhance → submit().updates() → retain result → goto(/org/{id}, { refreshAll: true })
  ├─ navigation failure after success → retain Open organization link
  └─ unknown mutation outcome → preserve input; check organizations before retrying
```

Kit owns same-origin validation, fields, and pending state; the remote independently verifies identity. Use an unkeyed form: `.for(...)` adds an `id` that violates the name-only contract. `CreateOrganizationForm` owns submission and local recovery. Carry its confirmed result in `PageState` for `OrganizationCreationRecovery`, composed by root and authenticated error boundaries. Use AuthProvider's uninterruptible Promise bridge; the request runner owns surrounding cancellation and diagnostics. A non-enhanced success renders the organization link.

**Atomic creation:** native creation leaves an orphan on failed membership insertion, and a plain `adapter.transaction` wrapper does not enlist provider writes. Use `runWithTransaction` with the explicit `@better-auth/core` dependency pinned to 1.7.4. This does not deduplicate submissions after a lost response.

**IDs:** use secure Nano ID `customAlphabet("0123456789ABCDEFGHJKMNPQRSTVWXYZ", 12)` through `advanced.database.generateId` for `model === "organization"`; fall back to Better Auth's `generateId(size)` for other models. Reuse the text primary key and ID routes rather than adding a public-ID column/resolver, mutable slug lifecycle, or numeric-ID encoding. Pin the direct Nano ID dependency to 3.3.19. Existing rows retain their IDs; newly created/seeded organizations use the generator.

The 32-symbol uppercase alphabet excludes I/L/O/U; 12 characters provide 60 random bits. At one million generated organization IDs in one database, the birthday-bound probability of any collision is approximately 1 in 2.3 million (11 characters: 1 in 72,000). PostgreSQL rejects collisions; retain normal operation failure rather than adding retry machinery. Routes still perform membership authorization; canonical generated URLs use uppercase without introducing alias decoding.

Estimate: 150–250 hand-written implementation lines plus focused integration coverage, within 400 total. Compose the existing Input/Button with the official Field family and required generated dependencies; use inline validation and accessible pending/error feedback. Generated source is excluded from the estimate.

## PR 6 files and proof

- Extend `apps/web/src/lib/server/{auth-provider,better-auth-options}.ts`, its existing `auth-provider.integration.ts` fixture, and explicit web dependencies/lockfile.
- Add `apps/web/src/lib/features/organizations/organizations.remote.ts` and `apps/web/src/routes/(authenticated)/organizations/new/+page.svelte`.
- Update `OrganizationSidebar.svelte`, `(authenticated)/+page.svelte`, and `apps/web/docs/authentication.md`; add official Field components/dependencies/exports in `packages/ui`.

| Boundary                                     | Proof and regression caught                                                                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing PostgreSQL auth integration fixture | Successful creation persists the short ID and correct owner; membership-write failure leaves neither row. Removing the wrapper must fail the rollback test. |
| Built Kit requests                           | Signed-out/unverified direct remote, forged user/role/slug, blank name, foreign origin, blocked provider endpoints; catches guard/input bypass              |
| Browser                                      | Zero/one/many entry points, viewer elsewhere, validation/pending, create → empty inbox → refreshed sidebar; catches stale or missing navigation             |
| Browser with controlled failures             | Lost response, provider outage, navigation failure after confirmed creation; catches lost input or creation repeated after known success                    |
| Browser                                      | Keyboard, ~375px/~1280px, light/dark, mobile menu dismissal, existing draft round trip; catches interaction regressions                                     |

Run Svelte autofixer with `--async`, `bun run check`, `bun run test:postgres`, and `bun run build`. Add only the successful-creation integration case and the rollback regression case; put the persisted ID format assertion in the first. Existing tests own auth guards, tenant isolation, constraints, and pool lifetime. Keep RNG distribution/uniqueness sampling, config-only tests, mocked call-order assertions, repeated lower-layer contracts, and test-only production exports out of this PR. Built-request and browser proofs remain manual.

## Sources checked for PR 6

- Local precedents: [remote form](../apps/web/src/lib/features/human-tasks/human-tasks.remote.ts), [enhancement](../apps/web/src/lib/features/human-tasks/ApprovalResponseForm.svelte), and [provider bridge](../apps/web/src/lib/server/auth-provider.ts).
- Reference: `mateoroldos/effect-forge`, `apps/web/src/routes/(authenticated)/+page.svelte`: native creation distinguishes uncertain outcomes from navigation failure; its slug-based UI differs from Moku.
- Better Auth 1.7.4 installed organization routes/adapter, core `context/transaction.mjs`, and `db/adapter/get-id-field.mjs`; [organization API](https://www.better-auth.com/docs/plugins/organization) and [custom ID documentation](https://www.better-auth.com/docs/concepts/database#id-generation).
- [Nano ID](https://github.com/ai/nanoid#custom-alphabet-or-size), [Crockford alphabet](https://www.crockford.com/base32.html), [Sqids limitations](https://sqids.org/faq), and [UUID formats](https://www.rfc-editor.org/rfc/rfc9562.html): short random IDs fit existing text keys; alternate encodings/resolvers add concepts without improving this flow.
- Kit 3.0.0-next.30 installed remote form and client navigation sources: `.updates()` suppresses implicit refresh; handled load failures resolve navigation into error boundaries. `goto({ refreshAll: true })` discards preloads, so preloading cannot guarantee destination success.
- Svelte 5.57.1, Effect 4.0.0-rc.112, and official [Field composition](https://shadcn-svelte.com/docs/components/field).

## Decided

- Navigation state carries transient creation confirmation across form unmounting; it grants no access and is not restored on full reload. Prefer Kit's per-history-entry state over a custom store/session storage with cleanup, server flash storage, or URL flags that cannot establish mutation success. A form-local result cannot survive destination errors; a confirmation page would change the approved create → inbox flow.
- Generated UI restoration and its check suppressions have completed user review. Keep official component families/APIs intact; approved diagnostic suppressions are separate from generated implementation. Application behavior belongs in consumers.
- Follow [authentication boundaries](../apps/web/docs/authentication.md) for protected entrypoints, role capabilities, and transactional writes. Membership snapshots never authorize navigation destinations; live updates belong to #10.
- Keep the organization picker visible with one membership. PR 6 adds a working creation entry for zero, one, and multiple memberships.
- PR 5 may exceed 400 lines for imported shadcn-svelte primitives and dependencies; application logic remains a focused slice.
- Tab-local drafts use [session storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage) over server persistence. Kit owns live form state; the web adapter owns stored feedback and user-scoped cleanup. Storage failure cannot block answering.
- Session storage survives reloads but is not durable or synchronized. Duplicated/opener tabs can start with copies; sign-out cleanup applies to the current tab.
- Better Auth over custom credentials: authentication is not Moku's product. Better Auth owns identity/membership storage; Moku owns task permissions.
- Organization IDs in URLs over readable slugs: sufficient for routing and access checks.
- Reset disposable development data over compatibility migrations. One process-owned database pool serves provider and tasks; [PostgreSQL persistence](../adapters/database-postgres/README.md) owns transactions.
- Console email in development and Cloudflare in production behind one email port. Production refuses console email; logs/events exclude passwords, codes, tokens, email bodies, and drafts.

## Risks

- Better Auth membership writes do not join Effect transactions; #10 must preserve write ordering.
- Email response timing may reveal account existence; measure before PR 7.
- Deployed HTTPS/trusted-proxy verification belongs to PR 8.
