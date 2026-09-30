# Verified identities and tenant-safe human review

Track: big feature + auth/data stakes · Status: slice 1 implemented; awaiting stack approval

Moku needs verified human identities, organization membership, and enforceable
task access. A teammate works within an organization; an external reviewer sees
only explicitly shared tasks. Both use the same identity and session system.

## Established reality

- `packages/core/src/human-task/human-task-directory.ts` and its PostgreSQL store
  currently accept task IDs without a principal or organization. The inbox is global.
- `apps/web/src/lib/features/human-tasks/human-tasks.remote.ts` exposes reads and
  responses without authentication. Protecting layouts alone cannot solve this.
- Moku runs SvelteKit 3.0.0-next.30, Effect 4.0.0-rc.112, and a process-owned Node
  runtime/pool. Slice 1 adds Better Auth 1.7.4.
- `../effect-forge` pins Better Auth and its Drizzle adapter to 1.7.4 and uses the
  same Effect release. Its identity/membership decoding, core permission checks,
  and inaccessible-organization handling are useful precedents. Its per-request
  runtime and Cloudflare deployment composition are not Moku's runtime model.
- Forge's inspected configuration enables passwords and organizations, but does
  not configure OTP or email delivery. Those need new integration work.
- Development data is disposable; there is no requirement to preserve the current
  unowned task dataset. A reset must still be explicit, outside request handling.

## Contract

### Accepted product decisions

- Email/password signup and login, with mandatory email confirmation by OTP.
- Self-service organization creation; one identity may belong to many organizations.
  Include an invite-only deployment setting, with a documented initial-owner path.
- Fixed organization roles: `owner`, `admin`, `member`, `viewer`. Organization
  members can see all tasks in that organization; private member-only tasks are
  outside this model.
- External reviewers authenticate and receive explicit task-scoped grants, with
  either read-only or read-and-respond permission. They need not join the organization.
- Human authentication first. Machine credentials and HTTP/MCP APIs are a follow-up.
- Ownership transfer, account deletion, and organization deletion belong in this
  feature, subject to explicit lifecycle rules below.
- Organization deletion never deletes user accounts, including users whose only
  membership was in that organization. It removes that organization's memberships
  and organization-owned data. Those users can create or join another organization.

### Observable scenarios

1. A person signs up, verifies their email by code, creates an organization, and
   reaches its inbox. Unverified accounts cannot access tenant data or accept invitations.
2. A person signs in, signs out, recovers a forgotten password, changes their
   password/email, and inspects/revokes sessions. Auth redirects preserve only safe
   local destinations, including invitation and review URLs.
3. A member switches organizations. Reloads and deep links resolve the organization
   in the URL; changing an active-organization preference never grants access.
4. An authorized manager invites someone by email, resends/cancels the invitation,
   changes permitted roles, and removes members. Invitees can accept or decline;
   wrong-email, expired, canceled, and already-consumed invitations cannot grant access.
5. A viewer reads but cannot create/respond/share. A member creates/responds. An
   admin manages membership within its authority; only an owner controls ownership.
6. A manager shares one task with a verified email identity. A guest can see that
   task, but not its organization's inbox, membership, or other tasks. Only a
   response grant permits completion. A forwarded URL alone confers no permission.
7. An owner transfers ownership, a member leaves, and authorized users delete
   their account or organization under agreed retention rules. No race can leave
   a live organization without an owner.
8. Development email appears in the local console; production email uses Cloudflare.
   Delivery failures have a recoverable user outcome rather than a false success.

### Invariants

- Every persisted task belongs to exactly one organization. Every store lookup,
  listing, and conditional completion is scoped by organization as well as task ID.
- Authentication establishes identity; core policy authorizes application behavior.
  Browser visibility is only presentation. All remotely callable operations and
  direct Better Auth organization endpoints must enforce the same intended policy.
- Server-resolved identity supplies the actor; posted user IDs and roles are never authority.
- Anonymous, unverified, wrong-tenant, insufficient-role, revoked, expired, and
  wrong-recipient access fail closed. Provider failures are availability failures,
  not evidence of sign-out or missing membership.
- Unauthorized resource discovery returns a uniform not-found response. A known
  member's forbidden action can report insufficient permission without leaking another tenant.
- Identity and membership caches never cross requests. Requests beginning after
  committed revocation see it; critical mutations recheck authorization within
  their consistency boundary. In-flight mutation/revocation ordering needs an
  explicit database strategy, not a promise of instantaneous cancellation.
- Preserve atomic first-response-wins. Record the responding user and access basis
  with the accepted answer. Approval remains a recorded decision, not execution.
- A task grant targets a stable authenticated user after verified-email acceptance.
  Changing an account email does not transfer an existing grant to another account.
- Durable security events contain actor, organization/resource, action, and time,
  but no passwords, OTPs, session tokens, invitation secrets, or email bodies.
- Console email is an explicitly development-only exception for inspecting OTPs;
  production must fail startup rather than silently select console delivery.

### Deliberately deferred

Social login, passkeys/MFA, SSO/SCIM, custom roles, nested teams, billing, platform
super-admin/impersonation, anonymous bearer-link review, and machine API keys.
These are separate product commitments, not implied by “SaaS auth.”

## Approved policy

| Capability                             | Owner | Admin | Member | Viewer | Guest              |
| -------------------------------------- | ----- | ----- | ------ | ------ | ------------------ |
| Read organization tasks                | Yes   | Yes   | Yes    | Yes    | Granted task only  |
| Create/respond to tasks                | Yes   | Yes   | Yes    | No     | Respond grant only |
| Grant/revoke external task access      | Yes   | Yes   | No     | No     | No                 |
| Invite/remove members and viewers      | Yes   | Yes   | No     | No     | No                 |
| Promote/manage admins or owners        | Yes   | No    | No     | No     | No                 |
| Edit organization settings             | Yes   | Yes   | No     | No     | No                 |
| Transfer ownership/delete organization | Yes   | No    | No     | No     | No                 |

Exactly one role per membership; multiple owners allowed. Owners promote
an existing verified member to owner; transfer promotes the recipient and demotes
the actor atomically. Removing, demoting, leaving, or deleting the last owner is
rejected unless deleting that organization. Admins cannot modify owners or other
admins. No implicit owner bypass for account-bound guest invitations.

Security timings, set explicitly rather than inheriting library defaults:

- Verification/recovery OTP: six digits, five-minute lifetime, three failed
  attempts; single use, hashed storage, resend rotates the code; 60-second resend
  cooldown plus shared per-address and per-source abuse limits.
- Organization and guest invitations: seven days; resend invalidates the prior
  invitation. Task grant lifetime: 30 days from acceptance, revocable
  sooner, with explicit renewal by a manager. Invitation expiry and grant expiry
  are different states.
- Session: seven-day maximum lifetime with a documented renewal policy; fresh
  authentication within five minutes for email/password changes, ownership
  transfer, and deletion. Password recovery revokes existing sessions.
- Require proof of both old and new email for email changes. Lost-inbox recovery
  needs a separate policy; do not add a support bypass implicitly.

### Lifecycle decisions and remaining implementation prerequisites

1. **Deletion and retention:** account deletion removes credentials,
   sessions, memberships, and grants and anonymizes retained response attribution;
   historical decisions remain meaningful. Organization deletion is an
   explicit permanent purge of its tasks, grants, invites, and membership data,
   without deleting any user accounts, credentials, or unrelated memberships and
   grants. A sole owner must transfer ownership or delete the organization before
   deleting their own account. Security-event retention, backup retention, and
   whether there is a cancellation/recovery window still need explicit resolution
   before the deletion slice. Do not enable provider deletion endpoints until
   these rules are implemented.
2. **Guest boundaries:** manager-only sharing, 30-day grants, and visibility
   of the entire shared task including its recorded result. Sensitive task content
   cannot be selectively hidden by this first grant model.
3. **Deployment:** confirm Node remains the deployment target and Cloudflare Email
   Sending is available for the target account/domain. Define the trusted reverse
   proxy before trusting any client-IP header for rate limits.
4. **Operational limits:** use the approved timings above and choose organization, invitation,
   and send-volume limits before public rollout. Invite-only bootstrap must be a
   one-time operator procedure, not a persistent registration bypass.

## Shape and ownership

Proposed boundary contracts (TypeScript sketches; concrete Effect schemas and
precise tagged failures are authored with each approved slice):

```ts
type OrganizationRole = "owner" | "admin" | "member" | "viewer";
type TaskGrantPermission = "read" | "respond"; // respond includes read

interface Principal {
  readonly userId: UserId;
}
interface TaskRef {
  readonly organizationId: OrganizationId;
  readonly taskId: HumanTaskId;
}
interface OrganizationMember {
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
  readonly role: OrganizationRole;
}
interface TaskGrant {
  readonly task: TaskRef;
  readonly userId: UserId;
  readonly permission: TaskGrantPermission;
  readonly expiresAt: DateTime.Utc;
}
interface EmailMessage {
  readonly to: EmailAddress;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}
```

- **Domain:** branded user/organization identifiers, membership roles, task access
  values, and response attribution. Do not put Better Auth types in domain/core.
- **Core:** organization membership port, operation-local permission definitions,
  tenant-aware `HumanTaskDirectory`, guest grant policy/persistence port, and email
  delivery port. Example changed signatures: `get(principal, taskRef)`,
  `list(principal, organizationId)`, `create(principal, organizationId, input)`,
  `respond(principal, taskRef, result)`. Expected failures distinguish access denial,
  missing resources, expired grants, completed tasks, and dependency unavailability.
- **PostgreSQL adapter:** provider schema/migrations, tenant-scoped task SQL,
  grants/response attribution/security events, atomic membership lifecycle guards.
  Preserve the existing Effect SQL integration for application persistence.
- **Web:** Better Auth configuration/provider bridge, Svelte client, request-local
  authenticated context, provider failure translation, and feature remotes/pages.
  Keep the Node process runtime/pool owner. Auth's Promise-compatible database
  connection must have explicit ownership; verify whether it can safely reuse the
  existing pool before adding a separately bounded pool. Never cast the Effect
  Drizzle client into a Promise client.
- **Email adapters:** console and Cloudflare implementations of one delivery port;
  composition selects them. Render auth/invitation templates at their feature
  boundary; the transport owns HTTP/provider failure translation. Update workspace
  rules only when actual new adapter workspaces are introduced.

Better Auth owns credentials, sessions, OTP verification, organization membership,
and organization invitations. Moku owns task permissions/grants and tenant policy.
Use the organization plugin's access controls/hooks for its endpoints and a
provider-neutral role policy for core; integration tests prove these agree. Do not
build a second membership database or expose a provider-independent auth framework.

### Behavior traces

```text
signup / verify / recover / login
  -> Better Auth endpoint: input + origin + abuse checks
  -> provider credential/verification/session state
  -> email callback -> rendered EmailMessage -> delivery adapter
  -> safe auth result -> Svelte form state / session cookie / local redirect

organization create / invite / accept / role change / leave / transfer
  -> Better Auth endpoint: verified identity + configured role policy
  -> lifecycle hook/transaction guard -> membership/invitation state + event
  -> invitation email where needed -> authoritative UI refresh

task query / response remote
  -> Effect Schema parse -> request identity -> core task authorization
  -> organization-scoped store operation
  -> conditional completion + actor attribution -> safe result projection

guest invite / accept / revoke
  -> feature remote -> verified identity + manager or recipient policy
  -> scoped grant store transition + event -> invitation email where needed
  -> guest review route -> core authorization -> same scoped task operations

account / organization deletion
  -> fresh authentication + explicit confirmation -> lifecycle policy
  -> transaction(s) implementing approved purge/anonymization rules
  -> revoke access -> clear client state -> safe destination
```

Do not hold SQL transactions open across email HTTP requests. Before the mail slice,
choose a truthful delivery strategy: durable queue/outbox if crash-resilient
acceptance is promised, otherwise bounded awaited delivery with explicit resend
and persisted-state recovery. Avoid detached request fibers and automatic retries
of uncertain non-idempotent sends. Public auth responses must not disclose account
existence through message differences; examine timing as well as content. This
integration decision requires checking the installed provider's callback semantics.

## Delivery slices and evidence

### Slice 1 implementation decisions

- Three review-sized jj changes: additive auth schema/tooling, provider/configuration
  contracts and integration tests, then shared-pool runtime/HTTP wiring. Review as
  sequential PRs so generated schema and runtime lifecycle changes remain focused.
- Pin Better Auth, its CLI, and the relations-v2 Drizzle adapter to 1.7.4.
  Generate core user/session/account/verification/rate-limit tables now; organization
  plugin schema accompanies the organization slice, before its consumers.
- Reuse a single process-owned `pg.Pool` via installed Effect `PgClient.fromPool`
  and Drizzle's Promise client. Preserve application temporal codecs and prove both
  clients work with the same pool and release it at runtime shutdown.
- Expose only sign-in, sign-out, and session lookup in this foundation. Signup is
  disabled, verified email is required, and deletion is disabled. Tests provision
  verified credentials directly; no onboarding or tenant protection is implied.
- Seven-day sessions have an absolute lifetime: no sliding renewal, no cookie
  cache. Cookies are returned by the provider HTTP handler; internal session reads
  cannot refresh cookies. HTTP origins require explicit configuration; production
  uses HTTPS. No forwarded IP headers are trusted yet, so provider rate limiting
  falls back to a shared per-path bucket until deployment proxy trust is configured.
- Schema rollback means rolling back the consumer while retaining harmless additive
  tables; applied migration history is not rewritten.
- Better Auth's optional SvelteKit peer range still names Kit 2. The integration
  uses the native Request/Response handler, not Kit-specific provider helpers.
  Kit 3 compilation and a running built-server sign-in/session/sign-out smoke test
  establish compatibility for this surface. Browser/action integrations remain unverified.
- Negative tests explicitly keep origin/CSRF checks enabled under the provider's
  test environment; test-mode defaults would otherwise bypass origin enforcement.

Slices are sequential unless their ownership and contracts are demonstrably
independent. Each feature slice includes its frontend; screens are not deferred to
one final UI phase. Schema changes precede consumers in dedicated changes. Incomplete
auth stages are not a production-ready multi-tenant release.

- [x] **1. Establish provider/database compatibility and auth schema.** Pin a
      supported Better Auth/adapter pair (Forge's 1.7.4 is the starting candidate),
      verify installed APIs against Kit 3/Drizzle prereleases, and add reproducible
      provider schema generation/migrations. Resolve connection ownership and cookies.
  - Proof: production migrations in PGlite and PostgreSQL; auth handler/session
    integration through the real provider; schema drift check; build/type checks.
  - This is the technical feasibility gate before broad feature implementation.
  - Evidence: full `bun run check` (zero lint warnings), build, migrated PGlite
    provider tests, PostgreSQL migration/runtime tests, and a built Node HTTP smoke
    test. Security-focused Codex review identified the development-origin mismatch;
    fixed the example to port 5173 and made the built-server origin explicit.
    Configuration tests additionally own rejected origins and secret redaction;
    these failures arise before the provider integration seam.
- [ ] **2. Verified account onboarding and recovery.** Add email adapters, signup,
      login/logout, OTP confirmation/resend, password recovery, and verified-user guards.
  - Proof: entrypoint integration `unverified users cannot enter the application`,
    `expired, wrong-purpose, exhausted and replayed OTPs cannot verify or recover`,
    `reset revokes prior sessions`, and `untrusted origins and redirects are rejected`.
    Substitute the email port to inspect real callback messages; adapter HTTP tests
    cover failure translation. Browser checks cover OTP paste, resend countdown,
    inline failure/input retention, expired session, and retry after delivery failure.
    Send one real Cloudflare message only with an approved recipient/account.
- [ ] **3. Organization onboarding and switching.** Create/list organizations,
      select an organization, and load stable tenant context from the URL. Add
      self-service/invite-only policy and bootstrap procedure.
  - Proof: `creation obeys deployment signup policy` and `URL organization access
does not trust active-organization state`; browser create/switch/reload/deep link.
- [ ] **4a. Persist tenant ownership and response attribution.** Add organization
      keys/indexes/constraints and actor attribution; explicitly reset development
      tasks or seed a named development tenant. Stage the migration before consumers.
  - Proof: migration and constraint tests against the production schema; review
    rollback/reset procedure. Do not serve unscoped routes during cutover.
- [ ] **4b. Isolate and authorize every task operation.** Change directory/store
      contracts and remotes together; replace the global inbox with tenant inboxes.
  - Proof: extend the existing store contract with `another tenant cannot read,
list or complete this task`; service permission matrix covers all four roles.
    Entrypoint test proves the authenticated actor reaches core. Extend existing
    real-PostgreSQL concurrency proof to preserve first-response-wins and attribution.
    Check inaccessible task IDs, old global URLs, and revoked mounted forms in browser.
- [ ] **5. Member invitations and administration.** Member list, pending
      invitations, accept/decline/resend/cancel, roles, remove/leave, and ownership transfer.
  - Proof: real-provider endpoint tests for wrong-recipient/replayed/expired/canceled
    invitations and privilege escalation through direct calls. PostgreSQL concurrency
    test `competing owner removals cannot orphan an organization`; browser invitation
    handoff through signup/login and session/query invalidation after membership changes.
- [ ] **6a. Persist task-scoped invitations and grants.** Add grant lifecycle,
      stable recipient identity, expiry/revocation, tenant-safe relationships, and events.
  - Proof: production migrations/constraints; no grant can refer to another tenant's task.
- [ ] **6b. External reviewers use only granted tasks.** Share/revoke UI, invite
      acceptance, and guest review entrypoint; read vs respond permission and expiry.
  - Proof: core access matrix plus entrypoint integration `forwarded links do not
grant access`, `guests cannot enumerate tenant data`, `read-only and revoked
grants cannot respond`, and `guest response records its actor once`. Browser
    wrong-account switching, expired invitations, grant expiry, and completed-task view.
- [ ] **7. Account security settings.** Profile, password/email changes, active
      sessions/revocation, and fresh-authentication challenges for sensitive operations.
  - Proof: `email change requires old and new inbox proofs`, `revoked sessions cannot
operate`, and `stale authentication cannot perform sensitive mutations` through
    configured provider endpoints. Browser reauthentication and other-device revocation.
- [ ] **8. Account and organization deletion.** Blocked on retention decisions;
      implement confirmation, ownership safeguards, purge/anonymization, and events.
      Land any additional lifecycle schema before consumers.
  - Proof: real-PostgreSQL tests for last-owner races, cross-tenant preservation,
    `organization deletion preserves users even without other memberships`,
    retained/anonymized decision history, and rollback on interrupted transactions;
    browser destructive confirmation and session invalidation.
- [ ] **9. Release evidence and operator setup.** Document auth origin/proxy,
      secrets, Cloudflare sender/domain setup, deployment mode, database cleanup,
      delivery recovery, retention, and development seeds. Exercise rate limits across
      instances and review provider endpoints for unintended enabled capabilities.
  - Proof: `bun run check`, `bun run build`, `bun run test:postgres`, a complete
    owner/member/viewer/guest browser journey, and an authorization-focused review.
    Report live email, deployment, and backup-retention evidence separately.

Each named test protects a security or persistence behavior the current suite does
not own; extend existing contract/concurrency tests where they already own it.
UI presentation is verified in the running app rather than mirrored by unit tests.

## Sources and next commitment

- Local precedent: `../effect-forge/apps/web/docs/authentication.md`,
  `../effect-forge/apps/web/src/lib/server/authentication.ts`, and
  `../effect-forge/packages/core/src/organization-access/`.
- [Better Auth SvelteKit integration](https://www.better-auth.com/docs/integrations/svelte-kit)
  and [email OTP](https://www.better-auth.com/docs/plugins/email-otp).
- [Cloudflare Email Service](https://developers.cloudflare.com/email-service/):
  transactional sending supports REST from Node; current docs identify sending as
  beta on Workers Paid. Actual account/sender readiness is not verified.

Upstream web documentation is current guidance, not proof of compatibility with
the pinned candidate. Recheck installed options/source in slice 1, especially OTP
storage, organization authorization hooks, transaction guarantees, and cookie refresh.

The user approved the scope and recommendations, with the explicit requirement
that organization deletion preserves every user account. Slice 1 is implemented
in separate schema, provider, and runtime changes. Next: review/approve that stack, then
build slice 2. Resolve operational prerequisites with their owning slices and
retention/recovery details before slice 8.
