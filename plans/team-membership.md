# Invite and manage organization teammates

Issue: [#10](https://github.com/mateoroldos/moku/issues/10)

Verified membership scopes every task operation. Better Auth implements organization management; core decides task permissions.

## Pull requests

| #   | Trunk gains                                                                           | Approach         | Done   |
| --- | ------------------------------------------------------------------------------------- | ---------------- | ------ |
| 1   | Read-only Team page listing members and roles                                         | design           | ✅ #25 |
| 2   | Better Auth manages organizations; core takes a resolved `Membership`                 | design           | ✅ #27 |
| 3   | `Organizations.invite` under Better Auth's invitation policy and email; no caller yet | design           | ✅ #28 |
| 4   | `/invitations/[id]`: sign in or sign up, return, accept, open the organization        | design           | ✅ #29 |
| 5   | Team: invite form, pending invitations, cancellation, invite limit; owners and admins | design           | ✅ #30 |
| 6   | Role changes and removal with controls and failure feedback; retire this plan         | design when next |        |

## Decided

- Better Auth implements account, session, organization, member, and invitation management under Moku's configured policies. Core owns domain operations: it enforces role policy on a resolved `Membership` and never looks up identity or membership.
- Application reads and writes of Better Auth data run on the server: remote functions call web services built from `AuthProvider`'s Better Auth instance. Better Auth's organization HTTP endpoints stay closed. Cookie-handling account flows, including signout, use `authClient`.
- `Organizations.create` runs as the session owner through Better Auth and is not atomic; a failed owner write can leave an empty organization. Accepted.
- Better Auth knows owner, admin, member, and viewer; viewers get member permissions. Owners and admins invite; admins cannot invite owners.
- Inviting a pending address resends its invitation. Better Auth swallows invitation email failures; they are logged.
- `InviteInput` uses Better Auth's email pattern, so a typo is a form error, not an outage.
- Login and signup return only to `/invitations/<id>`, from `?invitation=<id>`; no caller-chosen path is followed.
- Signed-out visitors see the invite screen even for an invalid invitation; Better Auth reveals invitation state only to a session. Accepted.
- Joining a full organization (100 members) shows a retryable 503. Accepted with the member cap.
- Better Auth lists every invitation an organization ever had, capped at 100 rows; past that, new pending invitations drop off Team. Accepted for now.
- Any member can read pending invitations through the remote, as Better Auth allows; Team shows them only to owners and admins.
- Team's invitation controls come from Better Auth's role objects (`organizationRoles`); the UI does not restate that policy. Better Auth's pending-invitation cap is the invite limit; there is no Moku rate limiter.
- Better Auth's 100-pending invitation cap is best-effort: expired invitations stay pending, and past 100 of them the cap stops counting. Accepted; owners and admins are trusted.
- Server-side `auth.api` calls skip Better Auth's rate limiter.
- Better Auth returns at most 100 organizations or members per list; its default membership limit also caps members at 100. Accepted.
- A session revoked between identity lookup and a Better Auth read surfaces as 503, not a login redirect; accepted.
- Task writes are not ordered against membership changes; a removed member's in-flight request may finish.
- Last-owner protection is Better Auth's check; concurrent races are accepted.
- Invitation links carry the invitation ID; acceptance requires the signed-in, verified recipient email.
