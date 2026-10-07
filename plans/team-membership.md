# Invite and manage organization teammates

Issue: [#10](https://github.com/mateoroldos/moku/issues/10)

## Pull requests

| #   | Trunk gains                                                                                     | Approach         | Done             |
| --- | ----------------------------------------------------------------------------------------------- | ---------------- | ---------------- |
| 1   | Read-only Team page listing members and roles                                                   | design           | merged: #25      |
| 2   | Invitation creation, delivery, and acceptance; entry points wait for PR 3                       | design below     | ready for review |
| 3   | Invite/sign-in-or-signup/accept journey, pending invitations, cancellation                      | design when next |                  |
| 4   | Role changes/removal with last-owner and task-write ordering protection; controls wait for PR 5 | design when next |                  |
| 5   | Membership controls and failure feedback; retire this plan                                      | design when next |                  |

Split a row if its design exceeds the small-PR limit.

## Decided

- Use Better Auth's documented invitation APIs and lifecycle defaults. Application requirements justify departures; hypothetical stronger guarantees do not.
- Core owns application authorization. Web owns authenticated identity and provider translation; persistence owns scoped queries and transactions.
- The roster uses Moku's membership read port. Its non-locking authorization does not decide mutation ordering.

## Design: PR 2 — Invitation backend

Use Better Auth 1.7.4's server APIs with the request's session headers. A request-bound `Invitations.Session` pairs the authenticated principal with creation and acceptance capabilities; core receives no headers or provider types. Core's named operations check verification and organization permissions. Acceptance relies on the provider's verified recipient-email check.

- **Native server APIs:** reuse provider validation, invitation state, expiration, resend, and membership creation; add a typed boundary and integration proof.
- **Moku-owned invitation persistence:** requires lifecycle SQL, email matching, and concurrency coverage already supplied by the provider. No agreed requirement justifies that cost.

```text
AuthProvider.invitationSession(headers)
  → authenticate → absent: null; lookup failure: AuthProvider.Unavailable
  → request-bound Invitations.Session

Invitations.create(session, CreateInput): Effect<InvitationId, …, OrganizationAccess.Service>
  → OrganizationAccess.require → unverified / outsider / denied / lookup unavailable
  → owner grant requires owner → denied
  → session.create → auth.api.createInvitation({ headers, body })
    → provider validation → Access.* or Invitations.Rejected(reason)
    → persist pending invitation → email callback → Email.send
    → decode invitation ID → Invitations.Unavailable on unexpected failure

Invitations.accept(session, InvitationId): Effect<Membership, …>
  → requireVerifiedEmail → unverified
  → session.accept → auth.api.acceptInvitation({ headers, body })
    → recipient, verification, expiration, status checks → Access.* or Invitations.Rejected(reason)
    → provider membership creation → decode Membership
    → unexpected provider/decoding failure → Invitations.Unavailable
```

Configure `viewer` without provider management permissions and explicitly require verified email for invitations. Retain provider expiry, limits, resend, and concurrency behavior. Success confirms invitation persistence, not email delivery: the provider catches email failures; Moku's email bridge logs them. Resend reuses the pending invitation.

Email links target `/invitations/[invitationId]`, supplied by PR 3. Provider HTTP endpoints remain restricted until the user-facing journey is available.

## Proof

Extend `apps/web/src/lib/server/auth-provider.integration.ts` through core operations and the real provider/database boundary. Its existing fixtures own authentication and email delivery; avoid a duplicate mocked lifecycle suite.

| Protects                    | Regression caught                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| Recipient and role binding  | Wrong account accepts, verification is bypassed, or accepted membership has the wrong role |
| Core invitation permissions | Viewer/outsider can invite or admin can grant owner                                        |
| Session binding             | An expired or revoked session can use a previously obtained capability                     |
| Delivery and retry          | Failed delivery loses the pending invitation or resend creates another invitation          |
| Failure translation         | Duplicate, already-member, expired, or consumed invitations lose their actionable outcome  |

Run `bun run check`, `bun run build`, and `bun run test:postgres` against a disposable database. Browser proof belongs to PR 3.

Sources: `packages/core/src/organization/organizations.ts`, `apps/web/src/lib/server/auth-provider.ts`, [Better Auth invitations](https://better-auth.com/docs/plugins/organization#invitations), and [server API](https://better-auth.com/docs/concepts/api); verify provider behavior against installed 1.7.4 sources.
