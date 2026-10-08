# Invite and manage organization teammates

Issue: [#10](https://github.com/mateoroldos/moku/issues/10)

Goal of this refactor: remove complexity, make ownership clear, and reduce integration glue. Better Auth owns everything about accounts and organizations; core only decides domain permissions on a resolved membership.

## Pull requests

| #   | Trunk gains                                                                                                                                                         | Approach         | Done   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------ |
| 1   | Read-only Team page listing members and roles                                                                                                                       | design           | ✅ #25 |
| 2   | Better Auth owns organizations; core takes a resolved `Membership`; `Organizations`, `OrganizationCreation`, `OrganizationAccess`, and the membership store deleted | design below     |        |
| 3   | Invitation policy and email configured in Better Auth; endpoints stay closed                                                                                        | design when next |        |
| 4   | Invite/sign-in-or-signup/accept journey, pending invitations, cancellation, invite limit                                                                            | design when next |        |
| 5   | Role changes and removal with controls and failure feedback; retire this plan                                                                                       | design when next |        |

## Design: PR 2 — Better Auth owns organizations

Alternatives: browser `authClient` writes add a second action pattern and break server-rendered reads. Keeping core lookups over a Moku store makes core own Better Auth's data. Chosen: remote functions call a web `Organizations` service built from `AuthProvider`'s Better Auth instance; core receives the resolved membership.

```diff
 respondToHumanTask remote (and get/list, org layout)
-  → AuthGuard.requirePrincipal → HumanTasks.respond(principal, ref, result)
-    → OrganizationAccess.withWriteAccess → store.withLock (FOR SHARE) → store.complete
+  → AuthGuard.requireMembership(authenticate, headers, organizationId): Membership
+      absent → /login · unverified → 403 · outsider → Access.NotFound 404 · outage → 503
+      → Organizations.role → auth.api.getActiveMemberRole({ organizationId })
+  → HumanTasks.respond(membership, taskId, result)
+    → Access.requireRole(allowedRoles.respond, membership.role)     → Access.Denied 403
+    → store.complete({ organizationId: membership.organizationId, taskId }, …)
 layout org list / Team roster / creation
-  → core Organizations → store list methods / OrganizationCreation
+  → Organizations.list / listMembers / createWithOwner (web; createWithOwner moved unchanged)
```

`apps/web/src/lib/server/organizations.ts` owns the contract; `AuthProvider` implements it. Core keeps `Access` and `HumanTasks`; deleted: `OrganizationAccess`, `OrganizationMembershipStore` and its adapter, `Organizations`, `OrganizationCreation`, and the lock-ordering integration tests. `architecture.md`, `effect.md`, `authentication.md`, and the adapter README record the rule.

| Test                                                          | Level                  | Fails if                                        |
| ------------------------------------------------------------- | ---------------------- | ----------------------------------------------- |
| Caller's organizations; roster for members, 404 for outsiders | PostgreSQL integration | Data leaks across organizations or order breaks |
| Role resolves for members; outsider → NotFound                | PostgreSQL integration | Core receives a wrong or foreign membership     |
| `requireMembership` rejects absent and unverified callers     | Web unit               | Verification moves out of every entrypoint      |
| Core role policy per operation (existing, rewritten)          | Core unit              | A role gains or loses a task permission         |

Browser: inbox, answer a task, Team, create → inbox. Run `bun run check`, `bun run build`, `bun run test:postgres`.

Sources: `apps/web/src/lib/server/auth-provider.ts`, Better Auth 1.7.4 `crud-members.mjs` (`getActiveMemberRole`, `listMembers`).

## Decided

- Better Auth owns accounts, sessions, organizations, members, invitations, and the policy that manages them. Core owns domain operations: it enforces role policy on a resolved `Membership` and never looks up identity or membership.
- Application reads and writes of Better Auth data run on the server: remote functions call web services built from `AuthProvider`'s Better Auth instance. Better Auth's organization HTTP endpoints stay closed. Account flows that set cookies before a session exists use `authClient`.
- Server-side `auth.api` calls skip Better Auth's rate limiter; PR 4 adds an invite limit.
- Better Auth returns at most 100 organizations or members per list; its default membership limit also caps members at 100. Accepted.
- A session revoked between identity lookup and a Better Auth read surfaces as 503, not a login redirect; accepted.
- Task writes are not ordered against membership changes; a removed member's in-flight request may finish.
- Last-owner protection is Better Auth's check; concurrent races are accepted.
- Invitation links carry the invitation ID; acceptance requires the signed-in, verified recipient email.
