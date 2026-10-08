# Invite and manage organization teammates

Issue: [#10](https://github.com/mateoroldos/moku/issues/10)

Verified membership scopes every task operation. Better Auth implements organization management; core decides task permissions.

## Pull requests

| #   | Trunk gains                                                                              | Approach         | Done   |
| --- | ---------------------------------------------------------------------------------------- | ---------------- | ------ |
| 1   | Read-only Team page listing members and roles                                            | design           | ✅ #25 |
| 2   | Better Auth manages organizations; core takes a resolved `Membership`                    | design below     |        |
| 3   | Invitation policy and email configured in Better Auth; endpoints stay closed             | design when next |        |
| 4   | Invite/sign-in-or-signup/accept journey, pending invitations, cancellation, invite limit | design when next |        |
| 5   | Role changes and removal with controls and failure feedback; retire this plan            | design when next |        |

## Design: PR 2 — Better Auth manages organizations

Remote functions call a web `Organizations` service built from `AuthProvider`'s Better Auth instance; core receives the resolved membership. Core needs membership facts for task policy, without a lookup or locking capability.

```text
respondToHumanTask remote (and get/list, org layout)
  → locals.auth.requireMembership(organizationId): Membership
      absent → /login · unverified → 403 · outsider → Access.NotFound 404 · outage → 503
      → Organizations.role → auth.api.getActiveMemberRole({ organizationId })
  → HumanTasks.respond(membership, taskId, result)
    → Access.requireRole(allowedRoles.respond, membership.role)     → Access.Denied 403
    → store.complete({ organizationId: membership.organizationId, taskId }, …)
layout org list / Team roster / creation
  → Organizations.list / listMembers / createWithOwner (web)
```

`apps/web/src/lib/server/organizations.ts` owns the provider-facing contract; `AuthProvider` implements it. Core's `HumanTasks` owns task role policy and persistence sequencing.

| Test                                                          | Level                  | Fails if                                        |
| ------------------------------------------------------------- | ---------------------- | ----------------------------------------------- |
| Caller's organizations; roster for members, 404 for outsiders | PostgreSQL integration | Data leaks across organizations or order breaks |
| Role resolves for members; outsider → NotFound                | PostgreSQL integration | Core receives a wrong or foreign membership     |
| `requireMembership` rejects absent and unverified callers     | Web unit               | Verification moves out of every entrypoint      |
| Core role policy per operation                                | Core unit              | A role gains or loses a task permission         |

Browser: inbox, answer a task, Team, create → inbox. Run `bun run check`, `bun run build`, `bun run test:postgres`.

Sources: `apps/web/src/lib/server/auth-provider.ts`, Better Auth 1.7.4 `crud-members.mjs` (`getActiveMemberRole`, `listMembers`).

## Decided

- Better Auth implements account, session, organization, member, and invitation management under Moku's configured policies. Core owns domain operations: it enforces role policy on a resolved `Membership` and never looks up identity or membership.
- Application reads and writes of Better Auth data run on the server: remote functions call web services built from `AuthProvider`'s Better Auth instance. Better Auth's organization HTTP endpoints stay closed. Cookie-handling account flows, including signout, use `authClient`.
- Server-side `auth.api` calls skip Better Auth's rate limiter; PR 4 adds an invite limit.
- Better Auth returns at most 100 organizations or members per list; its default membership limit also caps members at 100. Accepted.
- A session revoked between identity lookup and a Better Auth read surfaces as 503, not a login redirect; accepted.
- Task writes are not ordered against membership changes; a removed member's in-flight request may finish.
- Last-owner protection is Better Auth's check; concurrent races are accepted.
- Invitation links carry the invitation ID; acceptance requires the signed-in, verified recipient email.
