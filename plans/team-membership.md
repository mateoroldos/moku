# Invite and manage organization teammates

Issue: [#10](https://github.com/mateoroldos/moku/issues/10)

## Pull requests

| #   | Trunk gains                                                                                         | Approach         | Done |
| --- | --------------------------------------------------------------------------------------------------- | ---------------- | ---- |
| 1   | Read-only Team page listing organization members and roles                                          | design below     |      |
| 2   | Invitation creation, email delivery, and acceptance behavior; entry points wait for PR 3            | design when next |      |
| 3   | Invite/sign-in-or-signup/accept journey, pending invitations, and cancellation                      | design when next |      |
| 4   | Role changes and removal with last-owner and task-write ordering protection; controls wait for PR 5 | design when next |      |
| 5   | Membership controls and failure feedback; retire this plan                                          | design when next |      |

Each PR leaves trunk usable. Split a row if its design exceeds the small-PR limit; only PR 1 is designed here.

## Design: PR 1 — Team page (approved)

Recommend extending the membership read path: the smallest change preserving Moku's organization authorization and failure behavior.

- **Membership store:** one projection/method, scoped SQL join, remote query, page, and sidebar link. Proof: adapter isolation/decoding and direct-entrypoint authorization.
- **Better Auth `listMembers`:** adds an AuthProvider method, provider-result decoding, permission-error translation, and pagination handling. Proof: provider integration/mapping plus the same UI checks.

The existing adapter already reads provider-owned memberships for authorization and navigation. This read-path choice does not decide later mutation ownership.

```text
MemberSummary = { userId: UserId, name: string, email: string, role: OrganizationRole }
OrganizationMembershipStore.listMembers(id: OrganizationId)
  : Effect<readonly MemberSummary[], OrganizationMembershipStore.Unavailable>
listOrganizationMembers(id: OrganizationId): Promise<readonly Encoded<MemberSummary>[]>
  → remote query schema: OrganizationId                    invalid → Kit validation failure
  → locals.run("Remote.listOrganizationMembers", program)
    → AuthGuard.requireVerified(locals.authenticate)       absent/unverified/unavailable → existing auth rejection
    → OrganizationAccess.require(principal, id, permission) outsider → 404; denied → 403; lookup failure → 503
    → OrganizationMembershipStore.listMembers(id)
      → member JOIN user WHERE organization_id=id          SQL/row decoding failure → Unavailable → 503
    → encode MemberSummary[] → Team page
```

Core owns `OrganizationAccess.permissions.listMembers` and the store's projection schema; reuse UserId/OrganizationRole. PostgreSQL selects only the projection, ordered by name then user ID. The remote authorizes independently of layouts; existing request cancellation, tracing, error boundaries, and non-locking read semantics apply.

Add `/org/[organizationId]/team` and Team below Inbox in the sidebar. Use a compact semantic list: name and email grouped together, role alongside, “You” derived from `viewer.userId`. Long text wraps on mobile. Reuse the existing gutter, serif heading, tokens, awaited-query behavior, active navigation, and mobile dismissal. Visibility/data follow the approved scope in #10.

Render an empty result as “No members to show.” A failed read uses the authenticated error boundary, never an empty roster; a stale link after removal rechecks access. Estimate 150–250 handwritten lines plus focused proof, under 400 or revisit the split.

## PR 1 files

```text
packages/core/src/access/
  organization-membership-store.ts         MemberSummary schema + listMembers
  organization-access.ts                   roster-read permission
adapters/database-postgres/src/access/
  organization-membership-store-postgres.ts       member/user join
  organization-membership-store-postgres.test.ts  adapter proof
apps/web/src/lib/features/organizations/
  organizations.remote.ts                  guarded roster query
  OrganizationSidebar.svelte               Team navigation
apps/web/src/routes/(authenticated)/org/[organizationId]/team/
  +page.svelte                             roster rendering
```

Update existing store test implementations where the expanded interface requires it. Reuse existing tables, services, and runtime wiring.

## PR 1 proof

| Protects                                        | Level                                                                                                        | Fails if                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Scoped roster, join, projected fields, ordering | Adapter test through listMembers, using the PGlite fixture pattern                                           | Organization filter/join/projection or ordering is wrong                 |
| Persisted role decoding                         | Corrupt-role case in the same adapter test file                                                              | Unknown stored roles become valid members                                |
| Entry-point access                              | Built page/direct-remote HTTP: anonymous, unverified, outsider, allowed roles, stale access, database outage | Layout-only checks permit access, tenants leak, or failures look empty   |
| Navigation and roster                           | Browser: Inbox ↔ Team, org switch, Back/Refresh, one/many members, duplicate names, long text                | Active state/data belongs to another org or content becomes inaccessible |
| Responsive/keyboard behavior                    | Browser: 375px/1280px, light/dark, keyboard, mobile menu                                                     | Content overflows or navigation/focus breaks                             |

No existing test owns this SQL projection, justifying adapter coverage. Prove authorization at the real entrypoint without a test-only exported wrapper or new browser harness. Run Svelte autofixer with `--async`, `bun run check`, `bun run build`, and the above manual checks; add relevant PostgreSQL integration checks if provider/runtime behavior changes.

## Sources and precedents opened

- `adapters/database-postgres/src/access/organization-membership-store-postgres.ts`: list projection, decoding, failure mapping.
- `apps/web/src/routes/(authenticated)/+layout.server.ts`: verified identity then membership-store read through locals.run.
- `apps/web/src/lib/features/human-tasks/human-tasks.remote.ts`: schema-validated query, authorization, exhaustive HTTP mapping, encoding.
- `apps/web/src/routes/(authenticated)/org/[organizationId]/+page.svelte` and `apps/web/src/lib/features/organizations/OrganizationSidebar.svelte`: awaited query and org-relative navigation.
- `adapters/database-postgres/src/test/persistence-pglite.ts`: database fixture; `apps/web/docs/authentication.md`: access/read semantics; `DESIGN.md`: scanning lists and tokens.
- Installed Better Auth 1.7.4 `dist/plugins/organization/routes/crud-members.mjs`: listMembers. Installed Effect 4.0.0-rc.112 schema guidance. SvelteKit 3.0.0-next.30: existing remote-query usage.
