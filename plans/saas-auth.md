# Verified identity and tenant-safe tasks

Issue: [#8](https://github.com/mateoroldos/moku/issues/8) · Appetite: ~8 PRs

## ⚠️ Needs you

- Review the generated UI restoration and its separately committed check suppressions before PR 6 implementation.
- Before PR 7: approve synchronous email sending with resend over a durable queue; a crash can lose one email.
- Before PR 8: confirm the Cloudflare sender, Node hosting, and trusted proxy.

## Trunk path

No PR removes the working inbox. Drafts ship before organization switching so unfinished feedback survives navigation.

| PR  | Trunk gains                               | Users see                     | Approach                      | Done   |
| --- | ----------------------------------------- | ----------------------------- | ----------------------------- | ------ |
| 1   | Auth tables and one scoped pool           | Existing inbox                | known                         | ✅ #14 |
| 2   | Seeded login protects read and answer     | Working inbox after login     | known                         | ✅ #18 |
| 3   | Tenant scope, role policy, attribution    | Scoped inbox and answers      | known                         | ✅ #19 |
| 4   | Tab-local feedback drafts                 | Return to unfinished feedback | known                         | ✅ #20 |
| 5   | Organization chooser and sidebar switcher | Switch seeded organizations   | known                         | ✅ #21 |
| 5a  | Official generated UI source              | Existing organization sidebar | known · approved suppressions |        |
| 6   | Organization creation                     | Create org → inbox            | new · design before build     |        |
| 7   | Signup, email code, console email         | Verify → create org → review  | new · design before build     |        |
| 8   | Cloudflare email; plan deleted; #8 closed | Code arrives in a real inbox  | new · deployment verification |        |

## Rules

- Follow [authentication boundaries](../apps/web/docs/authentication.md) for protected entrypoints, role capabilities, and transactional writes.
- Logs and events never hold passwords, codes, tokens, email bodies, or feedback drafts; production refuses to start with console email.

## Design: generated UI compatibility

Use official shadcn-svelte CLI output with Phosphor configured in `components.json`.
Keep complete component families and their public APIs. Application-specific behavior
belongs in consumers; generator support types and utilities belong in UI integration.

Keep generated implementation intact. User-approved lint/type suppression comments
live in a separate commit and explain each upstream incompatibility. Application
code remains checked; native button props belong on the consumer's child snippet.

## Decided: PR 5

### Ownership

- Extend the authenticated layout's `Load.authenticated` operation to list organizations after verification. Reuse [OrganizationMembershipStore.list](../packages/core/src/access/organization-membership-store.ts); its existing PostgreSQL adapter owns the scoped query and row decoding.
- Home consumes parent data for the zero/one/many landing decision. The sidebar derives selection from the URL; a cached membership list never authorizes a destination.
- Keep independent guards in organization loads and task remotes. Listing needs no transaction, retry loop, or provider active-organization mutation.
- Place `Sidebar.Provider` in the authenticated layout. Root layout owns global styles/theme setup; move sign-out and its draft cleanup together into authenticated chrome.
- Public and authenticated error boundaries inherit their route layouts. Root failures use the shared public presentation without authenticated data; task failures retain task-specific recovery. The root hosts Sonner for global action feedback.
- Copy [sidebar-07's composition](https://shadcn-svelte.com/registry/sidebar-07.json), not its demo `activeTeam` state: Header → switcher, Content → Inbox, Footer → theme/sign-out. Use the standard sidebar variant.
- Import primitives through `packages/ui/components.json`; preserve Moku's button, tokens, and Phosphor icons. Review registry dependencies, package exports, and transitive generated code before accepting them.

### Request flow

```text
(authenticated)/+layout.server.ts load(event)
  └─ locals.run("Load.authenticated", program) → cancellation + diagnostics
       ├─ AuthGuard.requireVerified(locals.authenticate)
       │    └─ Required → login; Unverified → 403; Unavailable → 503
       └─ OrganizationMembershipStore.list(principal.userId)
            └─ SQL/row decode failure → Unavailable → 503, never an empty list

(authenticated)/+page.server.ts load(event)
  └─ await event.parent() → organizations
       ├─ zero → no-access page
       ├─ one → redirect 303 /org/{encoded id}
       └─ several → chooser with organization links

sidebar link → /org/{encoded id}
  ├─ existing org layout: parse ID → require membership → capabilities
  │    └─ invalid/missing membership → 404; storage unavailable → 503
  ├─ existing inbox query: verified principal + organization scope → tasks
  └─ completed navigation → close mobile sheet
```

### Files

```text
apps/web/src/
  routes/
    ~ +layout.svelte
    ~ +error.svelte
    + (public)/+layout.svelte
    + (public)/+error.svelte
    → (public)/login/+page.svelte
    ~ (authenticated)/+layout.server.ts
    + (authenticated)/+layout.svelte
    + (authenticated)/+error.svelte
    ~ (authenticated)/+page.server.ts
    ~ (authenticated)/+page.svelte
  lib/features/organizations/
    + OrganizationSidebar.svelte
  lib/features/navigation/
    + PublicLayout.svelte
    + RouteError.svelte
packages/ui/
  ~ package.json
  ~ src/theme.css
  + src/ui/{sidebar,dropdown-menu,...}/
  + src/hooks/                              registry mobile hook, if retained
~ bun.lock
```

### Proof

| Boundary                 | Cases                                                                  | Failure caught                                                           |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Built Kit requests       | Zero/one/many memberships; signed-out, unverified, backend unavailable | Wrong landing; leaked names; outage mistaken for no access               |
| Browser + built requests | Stale/forged organization link; viewer; different user                 | Navigation grants access or displays another user's memberships          |
| Browser                  | Inbox/review switching; back/forward; single organization              | Selection diverges from URL or the picker disappears with one membership |
| Browser                  | ~375px/~1280px, light/dark, keyboard, collapsed/mobile states          | Inaccessible controls, broken focus, sheet covering destination          |
| Browser                  | Draft in org A → org B → original task                                 | Navigation loses or mixes feedback                                       |

Use the installed Kit APIs, Svelte autofixer with `--async`, `bun run check`, and `bun run build`. [Sidebar](https://shadcn-svelte.com/docs/components/sidebar) and [dropdown](https://shadcn-svelte.com/docs/components/dropdown-menu) docs own primitive composition.

### Assumed

- Retain the membership store's organization-ID order; search is unnecessary for the seeded list.
- On the chooser, label the sidebar header “Choose organization” with no current checkmark. With no memberships, show “No organization access” and omit navigation destinations.
- Keep theme and sign-out as visible footer controls. Collapse state lasts for the mounted shell; expanded is the initial default.
- Membership lists can remain layout snapshots during navigation. Destination guards handle stale links; live membership updates belong to #10.

## Decided

- Keep the organization picker visible with one membership. PR 6 adds a working “Create organization” action for zero, one, and multiple memberships.
- PR 5 may exceed 400 lines for imported shadcn-svelte primitives and their dependencies; application logic remains a focused slice.
- Tab-local drafts use [session storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage) over server persistence. Kit owns live form state; the web draft adapter owns stored feedback and user-scoped cleanup. Storage failure cannot block answering.
- Browser session storage survives reloads but is not durable or synchronized. Duplicated/opener tabs can start with copies; sign-out cleanup applies to the current tab.
- Better Auth over custom credentials: authentication is not Moku's product; `../effect-forge` provides an Effect/SvelteKit precedent. Better Auth owns identity/membership storage; Moku owns task permissions.
- Organization IDs in URLs over readable slugs: sufficient for routing and access checks.
- Replacing the task schema and resetting development data over compatibility migrations: there are no users yet.
- One process-owned database pool for provider and task storage. See [PostgreSQL persistence](../adapters/database-postgres/README.md) for transaction ownership.
- Console email in development and Cloudflare in production behind one email port.

## Risks

- Better Auth membership writes do not join Effect transactions; #10 must preserve the write-ordering contract.
- Waiting for email may reveal whether an account exists through response time; measure before PR 7.
- Verify deployed HTTPS and trusted-proxy behavior in PR 8.
