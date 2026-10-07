# Invite and manage organization teammates

Issue: [#10](https://github.com/mateoroldos/moku/issues/10)

## Pull requests

| #   | Trunk gains                                                                                     | Approach              | Done           |
| --- | ----------------------------------------------------------------------------------------------- | --------------------- | -------------- |
| 1   | Read-only Team page listing members and roles                                                   | approved design below | in review: #25 |
| 2   | Invitation creation, delivery, and acceptance; entry points wait for PR 3                       | design when next      |                |
| 3   | Invite/sign-in-or-signup/accept journey, pending invitations, cancellation                      | design when next      |                |
| 4   | Role changes/removal with last-owner and task-write ordering protection; controls wait for PR 5 | design when next      |                |
| 5   | Membership controls and failure feedback; retire this plan                                      | design when next      |                |

Each PR leaves trunk usable. Split a row if its design exceeds the small-PR limit; only PR 1 is designed here.

## Design: PR 1 — Team page (approved)

Extend the membership read path and follow `HumanTasks` for application ownership. Core's `Organizations` owns the roster permission and authorized read; web resolves identity and translates results.

- **Membership store:** one scoped SQL projection behind the existing port. Add a core operation, remote query, page, and sidebar link; prove policy in core and SQL at the adapter.
- **Better Auth `listMembers`:** requires provider-result decoding, permission-error translation, and pagination handling, plus provider integration coverage. Existing membership reads already use Moku's port, making that the smaller consistent option.

```text
listOrganizationMembers(id: OrganizationId): Promise<readonly Encoded<MemberSummary>[]>
  → remote query schema                                  invalid → Kit validation failure
  → locals.run("Remote.listOrganizationMembers", program)
    → AuthGuard.requireVerifiedEmail(locals.authenticate) absent/unverified/unavailable → auth rejection
    → Organizations.listMembers(principal, id)
      → OrganizationAccess.require(..., allowedRoles)    outsider → 404; denied → 403; lookup failure → 503
      → OrganizationMembershipStore.listMembers(id)
        → member JOIN user WHERE organization_id=id      SQL/decoding failure → Unavailable → 503
    → encode MemberSummary[] → Team page
```

`MemberSummary { userId: UserId, name: string, email: string, role: OrganizationRole }` stays beside the core port: an application read projection composed from domain values. PostgreSQL selects only those fields, ordered by name then user ID. The operation requires a principal and preserves existing non-locking read semantics; layout checks do not authorize remote requests.

`/org/[organizationId]/team` uses a compact semantic list with name/email grouped together and role alongside. Derive “You” from `viewer.userId`; wrap long text on mobile. Reuse the page gutter, serif heading, tokens, awaited-query behavior, and sidebar active/mobile-dismissal behavior. Visibility follows #10.

An empty result renders “No members to show.” Failures use the authenticated error boundary. The read-path choice does not decide ownership of later mutations.

## Proof

| Protects                            | Level                                                                                                                                 | Fails if                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Authorized roster operation         | Core policy tests with the real OrganizationAccess Layer                                                                              | Allowed roles fail or unverified/outsider/wrong-org/failed-lookup calls return a roster |
| Scoped projection and role decoding | PGlite adapter tests                                                                                                                  | Join/filter/order/projection is wrong or unknown stored roles are accepted              |
| Entry-point wiring                  | Built page/direct-remote HTTP: identity/access cases, stale access, outage, forged caller pathname                                    | Transport bypasses the operation or failures look empty                                 |
| Navigation and display              | Browser: org switch, Back/Refresh, keyboard, mobile dismissal, one/many members, duplicate names, long text; 375px/1280px, light/dark | Data or active state belongs to another org, or content becomes inaccessible            |

Run `bun run check`, `bun run build`, and PostgreSQL integration checks when runtime composition changes. Use Svelte autofixer with `--async` and browser proof when UI changes; retain the existing manual HTTP/browser approach.

## Sources and precedents

- `packages/core/src/human-task/human-tasks.ts`: operation-owned authorization; `apps/web/src/lib/features/human-tasks/human-tasks.remote.ts`: request/response boundary.
- `adapters/database-postgres/src/organization/organization-membership-store-postgres.ts`: projection, decoding, failure mapping; `src/test/persistence-pglite.ts` in that adapter: fixture.
- The organization inbox route and `OrganizationSidebar.svelte`: awaited queries and navigation; `apps/web/docs/authentication.md` and `DESIGN.md`: access and presentation rules.
- Installed Better Auth 1.7.4 `listMembers`, Effect 4.0.0-rc.112 schema guidance, and SvelteKit 3.0.0-next.30 remote-query usage.
