# Invite and manage organization teammates

Issue: [#10](https://github.com/mateoroldos/moku/issues/10)

Verified membership scopes every task operation. Better Auth implements organization management; core decides task permissions.

## Pull requests

| #   | Trunk gains                                                                           | Approach         | Done   |
| --- | ------------------------------------------------------------------------------------- | ---------------- | ------ |
| 1   | Read-only Team page listing members and roles                                         | design           | ✅ #25 |
| 2   | Better Auth manages organizations; core takes a resolved `Membership`                 | design           | ✅ #27 |
| 3   | `Organizations.invite` under Better Auth's invitation policy and email; no caller yet | design           | ✅ #28 |
| 4   | `/invitations/[id]`: sign in or sign up, return, accept, open the organization        | design below     |        |
| 5   | Team: invite form, pending invitations, cancellation, invite limit; owners and admins | design when next |        |
| 6   | Role changes and removal with controls and failure feedback; retire this plan         | design when next |        |

## Design: PR 4 — accept an invitation

Alternatives: a generic `?next=<path>` return needs open-redirect validation. Listing pending invitations on `/` misses single-org users, whom `/` redirects. Accepting on page load joins without consent and puts a write on a GET. Chosen: a confirmation page, and login and signup carry only `?invitation=<id>`.

```text
/invitations/[id] (public layout) → getInvitation(id) query
  → locals.auth.authenticate                       null → SignedOut: sign-in and sign-up links with ?invitation=<id>
  → Organizations.getInvitation(headers, id)       → Pending { organizationName, inviterEmail, role }
      expired, cancelled, accepted, unknown        → InvitationInvalid → Invalid view
      signed in as another email                   → NotRecipient → OtherAccount view: sign out, then /login?invitation=<id>
acceptInvitation form(id)
  → Organizations.acceptInvitation(headers, id) → auth.api.acceptInvitation → 303 /org/<organizationId>
      same failures                                → same views
/login?invitation=<id>    after sign-in, or when already signed in → /invitations/<id>
/signup?invitation=<id>   verification callbackURL /invitations/<id>; Better Auth signs in after verifying
```

The view is a tagged union: `SignedOut | Pending | Invalid | OtherAccount`. Requesting another verification link returns to `/login`; the emailed invitation link still works.

| Test                                                              | Level                  | Fails if                                                |
| ----------------------------------------------------------------- | ---------------------- | ------------------------------------------------------- |
| Recipient sees and accepts once; the member gets the invited role | PostgreSQL integration | Wrong role or organization, or a second accept succeeds |
| Another recipient and an expired invitation are rejected          | PostgreSQL integration | Someone else joins, or a failure maps to the wrong view |

Browser: an invitation row from SQL, then sign up → verify → accept → inbox; sign in → accept; signed in as another email; invalid link. Run `bun run check`, `bun run build`, `bun run test:postgres`.

Sources: `apps/web/src/lib/server/auth-provider.ts` (`invite`), Better Auth 1.7.4 `routes/crud-invites.mjs` (`getInvitation`, `acceptInvitation`), `routes/(public)/login`, `SignupForm.svelte`.

## Decided

- Better Auth implements account, session, organization, member, and invitation management under Moku's configured policies. Core owns domain operations: it enforces role policy on a resolved `Membership` and never looks up identity or membership.
- Application reads and writes of Better Auth data run on the server: remote functions call web services built from `AuthProvider`'s Better Auth instance. Better Auth's organization HTTP endpoints stay closed. Cookie-handling account flows, including signout, use `authClient`.
- `Organizations.create` runs as the session owner through Better Auth and is not atomic; a failed owner write can leave an empty organization. Accepted.
- Better Auth knows owner, admin, member, and viewer; viewers get member permissions. Owners and admins invite; admins cannot invite owners.
- Inviting a pending address resends its invitation. Better Auth swallows invitation email failures; they are logged.
- `InviteInput` uses Better Auth's email pattern, so a typo is a form error, not an outage.
- Server-side `auth.api` calls skip Better Auth's rate limiter; PR 5 adds an invite limit.
- Better Auth returns at most 100 organizations or members per list; its default membership limit also caps members at 100. Accepted.
- A session revoked between identity lookup and a Better Auth read surfaces as 503, not a login redirect; accepted.
- Task writes are not ordered against membership changes; a removed member's in-flight request may finish.
- Last-owner protection is Better Auth's check; concurrent races are accepted.
- Invitation links carry the invitation ID; acceptance requires the signed-in, verified recipient email.
