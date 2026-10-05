# Verified identity and tenant-safe tasks

Issue: #8 · Appetite: ~8 PRs

A teammate signs in, switches organizations, and reads and answers only their organization's tasks; a new person signs up, verifies their email, and creates an organization. Agents remain the intended task creators; agent submission will be shaped separately.

Not: task-authoring UI, HTTP/MCP agent submission, cross-device drafts; password recovery and sessions (#9), invitations and members (#10), guests (#11), deletion and invite-only (#12); social login, MFA, SSO, billing, machine API keys.

## ⚠️ Needs you

- Approve the proposed split: PR 4 preserves feedback drafts in the existing review UI; PR 5 adds organization navigation and its sidebar. Both ship usable behavior, within the original ~8 PR appetite.
- Approve a PR 5 size exception for imported shadcn-svelte primitives: the official sidebar and dropdown sources alone total about 1,364 lines, before their dependencies. The normal 400-line ceiling cannot accommodate them.
- Review the design below before implementation. Issue #8 still needs the agreed product scope synchronized; publishing the issue update and design PR needs approval.

## Trunk path

No PR removes the working inbox.

| PR  | Trunk gains                                      | Users see                     | Technique                         | Undo                              | Mode | Done   |
| --- | ------------------------------------------------ | ----------------------------- | --------------------------------- | --------------------------------- | ---- | ------ |
| 1   | Auth tables and one scoped pool for both drivers | Existing inbox                | contract first · keystone in PR 2 | revert code; retain unused tables | ask  | ✅ #14 |
| 2   | Seeded login protects read and answer            | Working inbox after login     | skeleton · live                   | revert                            | ask  | ✅ #18 |
| 3   | Tenant scope, role policy, attribution           | Scoped inbox and answers      | skeleton · live                   | revert, reset dev data            | ask  | ✅ #19 |
| 4   | Tab-local feedback drafts                        | Return to unfinished feedback | new · browser/form lifecycle      | revert; discard local drafts      | ask  |        |
| 5   | Organization chooser and sidebar switcher        | Switch seeded organizations   | new · authenticated app shell     | revert                            | ask  |        |
| 6   | Organization creation                            | Create org → inbox            | split · live                      | revert                            | ask  |        |
| 7   | Signup, email code, console email                | Verify → create org → review  | split · live                      | revert                            | ask  |        |
| 8   | Cloudflare email; docs; plan deleted; #8 closed  | Code arrives in a real inbox  | split · live                      | revert; sent mail stays           | ask  |        |

Later: [#9 Account security](https://github.com/mateoroldos/moku/issues/9), [#10 Team membership](https://github.com/mateoroldos/moku/issues/10), [#11 External review](https://github.com/mateoroldos/moku/issues/11), [#12 Lifecycle and production](https://github.com/mateoroldos/moku/issues/12)

## Rules

- Follow [authentication boundaries](../apps/web/docs/authentication.md) when adding protected entrypoints.
- Logs and events never hold passwords, codes, tokens, or email bodies; production refuses to start with console email.

## Agreed product contract

- Organization URLs own selection. Switching opens the selected organization's inbox, including when leaving a task review.
- Login lands at `/`: one organization redirects to its inbox, several show a chooser, none show the no-access state. Organization creation follows in PR 6.
- Use a shadcn-svelte sidebar with the organization switcher at the top, expanded by default, collapsible to an icon rail on desktop, and a sheet on mobile.
- Show organization names and a checkmark for the current organization. With one organization, show its name without a dropdown.
- Preserve unfinished feedback per user, organization, and task in browser session storage, across navigation and refresh. Clear it on confirmed completion or sign-out. Browser storage failure must not prevent answering.

These interview decisions await synchronization to issue #8; technical decisions live below.

## Design: PR 4 — feedback drafts

### Model and owner

`apps/web/src/lib/features/human-tasks/feedback-drafts.ts` owns key encoding, storage parsing, writes, and cleanup. It is a browser adapter, not a core service or a second task state machine. Kit still owns form input and submission state; PostgreSQL owns recorded responses.

```ts
type DraftKey = TaskRef & { readonly userId: UserId };
type FeedbackDraft = { readonly feedback: string };
type DraftStorageFailure = { readonly _tag: "DraftStorageUnavailable" };

// Proposed synchronous browser boundary; absence is not a failure.
read(key: DraftKey): Result<Option<FeedbackDraft>, DraftStorageFailure>;
write(key: DraftKey, draft: FeedbackDraft): Result<void, DraftStorageFailure>;
remove(key: DraftKey): Result<void, DraftStorageFailure>;
clearUser(userId: UserId): Result<void, DraftStorageFailure>;
```

- Reuse domain `TaskRef` and `UserId`. No cached decision: Approve/Reject submit immediately; feedback is the only unfinished field today.
- Use a versioned Moku namespace and unambiguous encoding of the three IDs. Decode the stored JSON with Effect Schema into `FeedbackDraft`; malformed entries become absent and are removed best-effort.
- Read `sessionStorage` only at the browser boundary, never during SSR or module initialization. Catch storage access, quota, and removal failures there; return a typed failure without draft contents in diagnostics.
- Save on input, without a debounce window that can lose the final keystroke on navigation. Empty feedback removes its entry. Keep the Kit field as the live value rather than introducing a second reactive draft value.
- The module earns its seam because both response forms and sign-out own callers, and storage failure/isolation need deterministic tests. Use a narrow native Storage dependency for tests, not a new Effect Layer or browser runtime.

### Call stack and lifecycle

```text
ApprovalResponseForm(task, viewer.userId)
  ├─ existing getHumanTask(TaskRef) → authenticated, tenant-scoped task
  ├─ pending + can respond → read(DraftKey)
  │    ├─ absent / malformed → keep ordinary empty form
  │    ├─ available → response.fields.feedback.set(draft.feedback)
  │    └─ storage unavailable → ordinary usable form; no saved claim
  ├─ feedback input → write(DraftKey, FeedbackDraft)
  ├─ submit → existing respondToHumanTask → authorized transaction
  │    ├─ authoritative completed / already-completed → remove(DraftKey)
  │    └─ validation / network / uncertain outcome → retain draft
  └─ later authoritative completed task load → remove(DraftKey)

existing signOut()
  ├─ capture viewer.userId → authClient.signOut()
  │    └─ provider/network failure → retain drafts and show existing error
  └─ success → clearUser(captured userId), best-effort → goto('/login')
```

- Restore only after a pending, answerable task loads, through a browser attachment on the form field. Persist from the input event's textarea value so listener ordering with Kit cannot save the previous keystroke. Read-only, inaccessible, and completed views must not display cached feedback.
- Capture the draft key for an in-flight submission so a navigation cannot clear the next task's draft. Optimistic `submitting` is not confirmation.
- Storage is a convenience, not an authorization cache. A failed removal must never resurrect feedback in a completed view.
- Browser session storage survives reloads; tabs do not synchronize. A duplicated/opener tab can start with a copy. Sign-out cleanup applies to this tab, not a cross-tab deletion guarantee.
- With JavaScript disabled, preserve the existing response behavior; draft restoration is unavailable. The current sign-out control uses the Better Auth browser client.

### Files

```text
apps/web/
  src/lib/features/human-tasks/
    + feedback-drafts.ts
    + feedback-drafts.test.ts
    ~ ApprovalResponseForm.svelte
    ~ HumanTaskReview.svelte                 pass authenticated user identity
  src/routes/
    ~ +layout.svelte                        sign-out cleanup
    ~ (authenticated)/org/[organizationId]/tasks/[id]/+page.svelte
  ~ vitest.config.ts                        include the draft adapter test
```

### Proof

| Test                    | Level                          | Fails if                                                                                                                    |
| ----------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Draft key isolation     | Unit, draft adapter            | A user/org/task reads or removes another key's feedback; delimiter collisions exist                                         |
| Storage degradation     | Unit, draft adapter            | Malformed data, blocked storage, quota errors, or failed deletion escape into the form                                      |
| User cleanup            | Unit, draft adapter            | Sign-out deletes another user's drafts or unrelated origin storage                                                          |
| Navigation and refresh  | Browser, existing review pages | The final typed input disappears on task A → B → A or refresh, or populates task B                                          |
| Response lifecycle      | Browser, real remotes          | Optimistic state/failure clears feedback; confirmed completion or already-completed restores it                             |
| Identity/access changes | Browser, built app             | Another user sees the draft; a viewer or inaccessible task restores it; sign-out retains readable drafts when storage works |

## Design: PR 5 — organization navigation

### Model and owner

Reuse the existing `OrganizationMembershipStore.list(userId): Effect<ReadonlyArray<Organization>, Unavailable>`, where `Organization` is `{ id: OrganizationId; name: string }`. Its PostgreSQL implementation joins memberships to organizations, scopes by user, and decodes rows through the domain schema.

The authenticated layout returns `{ viewer: Principal; organizations: ReadonlyArray<Organization> }`. Extend its existing named `Load.authenticated` operation to list organizations after verification. Do not add a list service, provider active-organization mutation, or role policy in the UI.

The home page consumes parent data and chooses by list length. The shell derives `Organization | undefined` from the route's organization ID and the list; absence means no selected organization, not permission to choose the first one. Preserve independent guards in organization loads and task remotes.

### Call stack

```text
(authenticated)/+layout.server.ts load(event)
  └─ locals.run("Load.authenticated", program) → request cancellation + diagnostics
       ├─ AuthGuard.requireVerified(locals.authenticate)
       │    └─ Required → login; Unverified → 403; Unavailable → 503
       └─ OrganizationMembershipStore.list(principal.userId)
            └─ SQL/row decode failure → Unavailable → 503, never an empty list

(authenticated)/+page.server.ts load(event)
  └─ await event.parent() → organizations
       ├─ zero → no-access page
       ├─ one → redirect 303 /org/{encoded id}
       └─ several → organization chooser with ordinary links

sidebar organization link → /org/{encoded id}
  ├─ close mobile sheet on completed navigation
  ├─ existing org layout: parse OrganizationId → require membership → capabilities
  │    └─ invalid/missing membership → 404; storage unavailable → 503
  └─ existing inbox query: verified principal + organization scope → tasks
```

Listing is a read: no write transaction, retry loop, or external provider API call. Membership may change after listing; links are hints and the destination rechecks access. The list can remain a layout snapshot during navigation; membership management and live list updates belong to #10.

### Shell

- Place `Sidebar.Provider` in a new authenticated layout component. Keep the public/login shell separate; the root layout continues owning global styles and theme setup.
- Use sidebar-07's composition: `Sidebar.Root collapsible="icon"` → Header (organization switcher), Content (Inbox), Footer (existing theme/sign-out controls). Move sign-out and its draft cleanup together. Use the standard sidebar variant, not a decorative inset dashboard.
- The switcher uses grouped dropdown items as organization links. Derive the checkmark and active inbox from the URL; do not copy the demo's mutable `activeTeam` state.
- On the chooser route, label the header “Choose organization” and show no current checkmark. With no memberships, show a no-access state and sign-out, without a broken Inbox destination.
- Collapsed controls retain accessible names. Mobile has a visible trigger, sheet title, focus handling, and closes after navigation. Names can truncate visually but remain available to assistive technology.
- Follow Moku tokens and Phosphor icons. Add the official sidebar/dropdown and their required primitives from `packages/ui/components.json`; adapt generator aliases and package exports instead of importing web-specific paths into shared UI.
- The sidebar registry depends on `is-mobile`, input, tooltip, skeleton, separator, button, and sheet. Review dependency/version additions and transitive generated code before accepting them; preserve the existing customized button.

### Files

```text
apps/web/src/
  routes/
    ~ +layout.svelte
    ~ (authenticated)/+layout.server.ts
    + (authenticated)/+layout.svelte
    ~ (authenticated)/+page.server.ts
    ~ (authenticated)/+page.svelte
  lib/features/organizations/
    + OrganizationSidebar.svelte             app navigation and switcher
packages/ui/
  ~ package.json                             generated dependency/export requirements
  ~ src/theme.css                            sidebar tokens mapped to Moku vocabulary
  + src/ui/{sidebar,dropdown-menu,...}/       required primitives only
  + src/hooks/                               registry mobile hook, if retained
~ bun.lock
```

### Proof

| Test                     | Level                                                          | Fails if                                                                                                                      |
| ------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Landing cardinality      | Built Kit requests/browser, zero/one/many seeded memberships   | Multiple memberships silently select the first; zero redirects to an inaccessible org                                         |
| Auth and list failures   | Built Kit requests, signed-out/unverified/unavailable fixtures | Private names leak or a backend failure is rendered as no memberships                                                         |
| Tenant navigation        | Browser + built requests                                       | A stale/forged org link grants access; viewer switching exposes answer controls; names from another user's memberships appear |
| Sidebar navigation       | Browser                                                        | Inbox/review switching loses URL authority; back/forward highlights the wrong org; a sole org still exposes a dropdown        |
| Responsive accessibility | Browser at ~375px/~1280px, light/dark, keyboard                | Collapse hides accessible names; mobile sheet traps focus incorrectly or stays over the destination                           |
| Draft integration        | Browser, two organizations                                     | Sidebar navigation bypasses PR 4 preservation or restores a different task's feedback                                         |

For implementation, run Svelte autofixer with `--async`, `bun run check`, and `bun run build`; report real-browser evidence separately. No new PostgreSQL write behavior is introduced by these slices.

### Assumed

- Retain the store's existing organization-ID order; alphabetical ordering and search are not required for the seeded list.
- Keep theme and sign-out as visible footer controls, without inventing an account/settings menu.
- Sidebar collapse state lasts for the mounted app shell; expanded is the initial default. Remembering it across sessions is unnecessary.
- Ordinary task links and switcher links navigate in the same tab. Session storage is best-effort and browser-managed, not a durable draft promise.

### Sources and remaining verification

- Installed versions: Effect `4.0.0-rc.112`, Svelte `5.57.1`, Kit `3.0.0-next.30`, Better Auth `1.7.4`.
- Existing [membership list port](../packages/core/src/access/organization-membership-store.ts), [PostgreSQL list](../adapters/database-postgres/src/access/organization-membership-store-postgres.ts), and [authentication boundaries](../apps/web/docs/authentication.md) establish ownership and authorization.
- [Sidebar docs](https://shadcn-svelte.com/docs/components/sidebar), [sidebar-07 source](https://shadcn-svelte.com/registry/sidebar-07.json), and [dropdown docs](https://shadcn-svelte.com/docs/components/dropdown-menu) establish UI composition. Registry sources were inspected on 2026-10-05; they are not installed or version-pinned yet.
- [Session storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage) establishes reload, tab-copy, and failure behavior.
- Installed Kit `src/runtime/form-utils.js` supplies `fields.feedback.set/value/as`; `src/runtime/client/remote-functions/form.svelte.js` owns input listeners and discards unused `.for(key)` instances after teardown. This cache is not draft persistence. The current custom enhance callback does not use Kit's default reset callback.
- A disposable `drafts.scratch.mjs` spike passed against the installed Kit field proxy and Effect schema: stored feedback decoded, `.set()` restored `.value()` and `.as('text').value`, and a malformed payload failed decoding. The spike was removed. Hydration, attachment ordering, same-route navigation, and submission races remain browser proofs for implementation.

## Risks

- Deployed HTTPS and trusted-proxy behavior require verification in PR 8.
- Better Auth membership writes do not join Effect transactions; membership management in #10 must preserve the write-ordering contract.
- Waiting for email may reveal whether an account exists through response time → measure before PR 7.
- Before PR 7: approve synchronous email sending with resend over a durable queue; a crash can lose one email.
- Before PR 8: confirm the Cloudflare sender, Node hosting, and trusted proxy.

## Decisions

- Transactional write authorization over request-snapshot membership: removal and demotion have deterministic ordering relative to task writes. See [authentication boundaries](../apps/web/docs/authentication.md).
- Organization IDs in URLs establish routing; readable slugs are unnecessary for access.
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
