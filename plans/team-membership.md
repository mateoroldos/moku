# Invite and manage organization teammates

Issue: [#10](https://github.com/mateoroldos/moku/issues/10)

Verified membership scopes every task operation. Better Auth implements organization management; core decides task permissions.

## Pull requests

| #   | Trunk gains                                                                              | Approach         | Done   |
| --- | ---------------------------------------------------------------------------------------- | ---------------- | ------ |
| 1   | Read-only Team page listing members and roles                                            | design           | ✅ #25 |
| 2   | Better Auth manages organizations; core takes a resolved `Membership`                    | design           | ✅ #27 |
| 3   | `Organizations.invite` under Better Auth's invitation policy and email; no caller yet    | design below     |        |
| 4   | Invite/sign-in-or-signup/accept journey, pending invitations, cancellation, invite limit | design when next |        |
| 5   | Role changes and removal with controls and failure feedback; retire this plan            | design when next |        |

## Design: PR 3 — invitations in Better Auth

Alternatives: a Moku invitation table rebuilds expiry, email, and acceptance that Better Auth already has. Browser `authClient` invites open organization endpoints. Chosen: `Organizations.invite` calls `auth.api.createInvitation` with the request headers, the same pattern as `create`.

```text
Organizations.invite(headers, organizationId, input: InviteInput)
  : Effect<void, Access.NotFound | Access.Denied | Organizations.AlreadyMember | Organizations.Unavailable>
  → auth.api.createInvitation({ headers, body: { organizationId, email, role, resend: true } })
      not a member                               → Access.NotFound
      member or viewer; admin inviting an owner  → Access.Denied
      already a member                           → AlreadyMember
      pending invitation                         → same ID, fresh expiry, email again
      100 pending (Better Auth's limit)          → Unavailable; accepted until PR 4
    → sendInvitationEmail → Email.Service: `${ORIGIN}/invitations/${id}`
      send failure → logged; Better Auth still succeeds; inviting again resends
```

`InviteInput = { email: trimmed email, role: OrganizationRole }`. `better-auth-options.ts` adds `roles: { ...defaultRoles, viewer: memberAc }`: Better Auth rejects unknown roles, and viewers get no organization permissions, like members. It also sets `requireEmailVerificationOnInvitation: true`. The auth route allowlist stays unchanged. The `/invitations/<id>` page lands in PR 4; with no caller, trunk sends no invitations.

| Test                                                                     | Level                  | Fails if                                                        |
| ------------------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------- |
| Owner invites a viewer; re-inviting resends the same invitation          | PostgreSQL integration | No email, wrong link or recipient, or duplicate invites         |
| Outsider, member, viewer, admin-to-owner, and existing-member rejections | PostgreSQL integration | A role gains invite rights or a failure maps to the wrong error |
| `InviteInput` accepts only emails Better Auth accepts                    | Web unit               | A typo surfaces as a 503 instead of a form error                |

Run `bun run check`, `bun run build`, `bun run test:postgres`.

Sources: `apps/web/src/lib/server/auth-provider.ts` (`create`), Better Auth 1.7.4 `routes/crud-invites.mjs` (`createInvitation`), `access/statement.mjs` (`defaultRoles`, `memberAc`).

## Decided

- Better Auth implements account, session, organization, member, and invitation management under Moku's configured policies. Core owns domain operations: it enforces role policy on a resolved `Membership` and never looks up identity or membership.
- Application reads and writes of Better Auth data run on the server: remote functions call web services built from `AuthProvider`'s Better Auth instance. Better Auth's organization HTTP endpoints stay closed. Cookie-handling account flows, including signout, use `authClient`.
- `Organizations.create` runs as the session owner through Better Auth and is not atomic; a failed owner write can leave an empty organization. Accepted.
- Server-side `auth.api` calls skip Better Auth's rate limiter; PR 4 adds an invite limit.
- Better Auth returns at most 100 organizations or members per list; its default membership limit also caps members at 100. Accepted.
- A session revoked between identity lookup and a Better Auth read surfaces as 503, not a login redirect; accepted.
- Task writes are not ordered against membership changes; a removed member's in-flight request may finish.
- Last-owner protection is Better Auth's check; concurrent races are accepted.
- Invitation links carry the invitation ID; acceptance requires the signed-in, verified recipient email.
