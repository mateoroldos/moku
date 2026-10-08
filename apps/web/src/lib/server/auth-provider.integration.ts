/* oxlint-disable effecttsgo/prefer-schema-over-json -- Exercise raw provider HTTP inputs. */
import { PgClient } from "@effect/sql-pg";
import { assert, it } from "@effect/vitest";
import { Access } from "@moku/core/access";
import { Email } from "@moku/core/email";
import { AuthStorage } from "@moku/database-postgres/auth-storage";
import { UserId } from "@moku/domain/identity";
import { OrganizationId } from "@moku/domain/organization";
import { PostgresConnection } from "@moku/database-postgres/postgres-connection";
import { hashPassword } from "better-auth/crypto";
import { Config, Effect, Layer, Logger, Redacted } from "effect";
import { AuthProvider } from "./auth-provider.ts";
import { Organizations } from "./organizations.ts";

const origin = "http://localhost:3000";
const credentials = { email: "authentication@moku.test", password: "integration-password" };
const request = (path: string, headers = new Headers(), body?: string) =>
  new Request(`${origin}/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin, "content-type": "application/json", ...Object.fromEntries(headers) },
    body: body ?? null,
  });

const postgres = Layer.unwrap(
  Config.redacted("TEST_DATABASE_URL").pipe(
    Effect.map((url) =>
      PostgresConnection.layer({ url, applicationName: "moku-auth-test", maxConnections: 1 }),
    ),
  ),
);

const fixture = Effect.fnUntraced(function* (
  clientAddress: string,
  delivery: Email.Interface = { send: () => Effect.void },
) {
  const sql = yield* PgClient.PgClient;
  const storage = yield* AuthStorage.Service;
  let unavailable = false;
  const database = Layer.succeed(AuthStorage.Service, (options) => {
    const adapter = storage(options);
    return {
      ...adapter,
      findOne: (input) =>
        unavailable ? Promise.reject(new Error("private storage failure")) : adapter.findOne(input),
    };
  });
  const { auth, organizations } = yield* Effect.gen(function* () {
    const auth = yield* AuthProvider.Service;
    const organizations = yield* Organizations.Service;

    return { auth, organizations };
  }).pipe(
    Effect.provide(
      AuthProvider.layer.pipe(
        Layer.provide(database),
        Layer.provide(Layer.succeed(Email.Service, delivery)),
      ),
    ),
  );
  const cleanup = sql`DELETE FROM verification WHERE value IN (
    SELECT id FROM "user" WHERE id = 'authentication-test' OR email = 'onboarding@moku.test'
  )`.pipe(
    Effect.andThen(
      sql`DELETE FROM "user" WHERE id = 'authentication-test' OR email = 'onboarding@moku.test'`,
    ),
  );
  yield* Effect.acquireRelease(cleanup, () => cleanup.pipe(Effect.orDie));
  const password = yield* Effect.promise(() => hashPassword(credentials.password));
  yield* sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('authentication-test', 'Reviewer', ${credentials.email}, true, now(), now())`;
  yield* sql`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
    VALUES ('authentication-test', 'authentication-test', 'credential', 'authentication-test', ${password}, now(), now())`;
  const response = yield* auth.handle(
    request("sign-in/email", new Headers(), JSON.stringify(credentials)),
    clientAddress,
  );
  assert.strictEqual(response.status, 200);
  const headers = new Headers({
    cookie: response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; "),
  });
  return {
    auth,
    organizations,
    sql,
    headers,
    setUnavailable: (value: boolean) => {
      unavailable = value;
    },
  };
});

const verifiedPrincipal = { userId: "authentication-test", emailVerified: true };
const signup = {
  name: "New reviewer",
  email: "onboarding@moku.test",
  password: "onboarding-password",
};

it.live("blocks unverified sign-in and establishes a session through the emailed link", () =>
  Effect.gen(function* () {
    const messages: Email.Message[] = [];
    const { auth } = yield* fixture("192.0.2.20", {
      send: (message) =>
        Effect.sync(() => {
          messages.push(message);
        }),
    });
    const post = (path: string, body: Record<string, string>) =>
      auth.handle(request(path, new Headers(), JSON.stringify(body)), "192.0.2.20");

    assert.strictEqual(
      (yield* post("sign-up/email", { ...signup, callbackURL: "/login?verified=true" })).status,
      200,
    );
    assert.strictEqual((yield* post("sign-in/email", signup)).status, 403);
    assert.strictEqual(messages.length, 1);
    const message = messages.at(-1);
    assert(message);
    assert.strictEqual(message.to, signup.email);
    const link = Redacted.value(message.text).split("\n")[0];
    assert(link);
    const verified = yield* auth.handle(new Request(link), "192.0.2.20");
    assert.strictEqual(verified.status, 302);
    assert.strictEqual(verified.headers.get("location"), "/login?verified=true");
    const headers = new Headers({
      cookie: verified.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0])
        .join("; "),
    });
    assert.strictEqual((yield* auth.authenticate(headers))?.emailVerified, true);
  }).pipe(Effect.scoped, Effect.provide(postgres)),
);

it.live("recovers a verified account and revokes its previous session", () =>
  Effect.gen(function* () {
    const messages: Email.Message[] = [];
    const { auth, headers } = yield* fixture("192.0.2.23", {
      send: (message) =>
        Effect.sync(() => {
          messages.push(message);
        }),
    });
    const post = (path: string, body: Record<string, string>) =>
      auth.handle(request(path, new Headers(), JSON.stringify(body)), "192.0.2.23");

    assert.strictEqual(
      (yield* post("request-password-reset", {
        email: credentials.email,
        redirectTo: "/reset-password",
      })).status,
      200,
    );
    const message = messages.at(-1);
    assert(message);
    const link = Redacted.value(message.text).split("\n")[0];
    assert(link);
    const response = yield* auth.handle(new Request(link), "192.0.2.23");
    assert.strictEqual(response.status, 302);
    const location = response.headers.get("location");
    assert(location);
    const token = new URL(location).searchParams.get("token");
    assert(token);
    const password = "recovered-password";
    assert.strictEqual(
      (yield* post("reset-password", {
        token,
        newPassword: password,
      })).status,
      200,
    );
    assert.strictEqual(yield* auth.authenticate(headers), null);
    assert.strictEqual((yield* post("sign-in/email", { ...credentials, password })).status, 200);
  }).pipe(Effect.scoped, Effect.provide(postgres)),
);

it.live("reports a delivery failure even when the provider returns success", () => {
  const entries: unknown[] = [];
  const logger = Logger.layer([
    Logger.make((options) => {
      entries.push(options.message);
    }),
  ]);

  return Effect.gen(function* () {
    const { auth } = yield* fixture("192.0.2.21", {
      send: () =>
        Effect.fail(new Email.Unavailable({ cause: Redacted.make("private email body") })),
    });

    const response = yield* auth.handle(
      request(
        "request-password-reset",
        new Headers(),
        JSON.stringify({ email: credentials.email }),
      ),
      "192.0.2.21",
    );
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(entries, [["email.send.failed"]]);
  }).pipe(Effect.scoped, Effect.provide(Layer.merge(postgres, logger)));
});

it.live("maps provider identity to a principal and rejects an expired session", () =>
  Effect.gen(function* () {
    const { auth, sql, headers } = yield* fixture("192.0.2.1");
    assert.deepStrictEqual(yield* auth.authenticate(headers), verifiedPrincipal);
    yield* sql`UPDATE session SET expires_at = '2000-01-01' WHERE user_id = 'authentication-test'`;
    assert.strictEqual(yield* auth.authenticate(headers), null);
  }).pipe(Effect.scoped, Effect.provide(postgres)),
);

it.live("keeps lookup outages distinct from an absent session", () =>
  Effect.gen(function* () {
    const { auth, headers, setUnavailable } = yield* fixture("192.0.2.2");
    setUnavailable(true);
    assert.strictEqual(yield* auth.authenticate(new Headers()), null);
    assert.strictEqual(
      (yield* Effect.flip(auth.authenticate(headers)))._tag,
      "AuthProvider.Unavailable",
    );
    setUnavailable(false);
    assert.deepStrictEqual(yield* auth.authenticate(headers), verifiedPrincipal);
  }).pipe(Effect.scoped, Effect.provide(postgres)),
);

it.live("signs out through the provider and invalidates the previous session", () =>
  Effect.gen(function* () {
    const { auth, headers } = yield* fixture("192.0.2.4");
    const response = yield* auth.handle(request("sign-out", headers, "{}"), "127.0.0.1");
    assert.strictEqual(response.status, 200);
    assert.include(response.headers.getSetCookie().join(";"), "Max-Age=0");
    assert.strictEqual(yield* auth.authenticate(headers), null);
  }).pipe(Effect.scoped, Effect.provide(postgres)),
);

it.live("uses provider CSRF checks, including trusted Referer fallback", () =>
  Effect.gen(function* () {
    const { auth, headers } = yield* fixture("192.0.2.6");

    const external = request("sign-out", headers, "{}");
    external.headers.set("origin", "https://outsider.test");
    assert.strictEqual((yield* auth.handle(external, "127.0.0.1")).status, 403);

    const referred = request("sign-out", headers, "{}");
    referred.headers.delete("origin");
    referred.headers.set("referer", `${origin}/`);
    assert.strictEqual((yield* auth.handle(referred, "127.0.0.1")).status, 200);
  }).pipe(Effect.scoped, Effect.provide(postgres)),
);

it.live("uses the supplied transport address instead of caller IP headers for throttling", () =>
  Effect.gen(function* () {
    const { auth } = yield* fixture("192.0.2.5");

    const attempt = (claimedIP: string, transportIP: string) =>
      auth.handle(
        request(
          "sign-in/email",
          new Headers({ "x-moku-client-ip": claimedIP, "x-forwarded-for": claimedIP }),
          JSON.stringify({ ...credentials, password: "incorrect-password" }),
        ),
        transportIP,
      );

    assert.strictEqual((yield* attempt("192.0.2.1", "192.0.2.10")).status, 401);
    assert.strictEqual((yield* attempt("192.0.2.2", "192.0.2.10")).status, 401);
    assert.strictEqual((yield* attempt("192.0.2.3", "192.0.2.10")).status, 401);
    assert.strictEqual((yield* attempt("192.0.2.4", "192.0.2.10")).status, 429);
    assert.strictEqual((yield* attempt("192.0.2.4", "192.0.2.11")).status, 401);
  }).pipe(Effect.scoped, Effect.provide(postgres)),
);

it.live("creates a short-ID organization with the session owner as its owner", () =>
  Effect.gen(function* () {
    const { organizations, sql, headers } = yield* fixture("192.0.2.7");
    const cleanup = sql`DELETE FROM organization WHERE name = 'auth-creation-test'`;
    yield* Effect.acquireRelease(cleanup, () => cleanup.pipe(Effect.orDie));

    const organization = yield* organizations.create(headers, { name: "auth-creation-test" });

    assert.match(organization.id, /^[0-9A-HJKMNP-TV-Z]{12}$/);
    assert.deepStrictEqual(
      yield* sql`
      SELECT o.id, o.name, m.user_id, m.role FROM organization o
      JOIN member m ON m.organization_id = o.id WHERE o.id = ${organization.id}
    `,
      [
        {
          id: organization.id,
          name: "auth-creation-test",
          user_id: "authentication-test",
          role: "owner",
        },
      ],
    );
    assert.deepStrictEqual(
      yield* sql`SELECT active_organization_id FROM session WHERE user_id = 'authentication-test'`,
      [{ active_organization_id: null }],
    );
  }).pipe(Effect.scoped, Effect.provide(postgres)),
);

const peer = Effect.fnUntraced(function* () {
  const sql = yield* PgClient.PgClient;
  const cleanup = sql`DELETE FROM "user" WHERE id = 'organization-peer'`;
  yield* Effect.acquireRelease(cleanup, () => cleanup.pipe(Effect.orDie));
  yield* sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('organization-peer', 'alex', 'peer@moku.test', true, now(), now())`;

  return UserId.make("organization-peer");
});

const peerOrganization = Effect.fnUntraced(function* (name: string) {
  const sql = yield* PgClient.PgClient;
  yield* sql`INSERT INTO organization (id, name, slug, created_at)
    VALUES (${name}, ${name}, ${name}, now())`;
  yield* sql`INSERT INTO member (id, organization_id, user_id, role, created_at)
    VALUES (${name}, ${name}, 'organization-peer', 'owner', now())`;

  return OrganizationId.make(name);
});

it.live("lists only the caller's organizations", () =>
  Effect.gen(function* () {
    const { organizations, sql, headers } = yield* fixture("192.0.2.40");
    const cleanup = sql`DELETE FROM organization WHERE name LIKE 'auth-list-%'`;
    yield* Effect.acquireRelease(cleanup, () => cleanup.pipe(Effect.orDie));
    yield* peer();

    const own = yield* organizations.create(headers, { name: "auth-list-own" });
    yield* peerOrganization("auth-list-other");

    assert.deepStrictEqual(yield* organizations.list(headers), [own]);
  }).pipe(Effect.scoped, Effect.provide(postgres)),
);

it.live("scopes membership and member lists to members and rejects unsupported roles", () =>
  Effect.gen(function* () {
    const { organizations, sql, headers } = yield* fixture("192.0.2.41");
    const cleanup = sql`DELETE FROM organization WHERE name LIKE 'auth-members-%'`;
    yield* Effect.acquireRelease(cleanup, () => cleanup.pipe(Effect.orDie));
    const other = yield* peer();

    const shared = yield* peerOrganization("auth-members-shared");
    yield* sql`INSERT INTO member (id, organization_id, user_id, role, created_at)
      VALUES ('auth-members-viewer', ${shared}, 'authentication-test', 'viewer', now())`;
    const foreign = yield* peerOrganization("auth-members-foreign");

    assert.deepStrictEqual(yield* organizations.listMembers(headers, shared), [
      { userId: other, name: "alex", email: "peer@moku.test", role: "owner" },
      {
        userId: UserId.make("authentication-test"),
        name: "Reviewer",
        email: credentials.email,
        role: "viewer",
      },
    ]);
    assert.deepStrictEqual(
      yield* Effect.flip(organizations.listMembers(headers, foreign)),
      new Access.NotFound({}),
    );
    assert.deepStrictEqual(
      yield* Effect.flip(organizations.listMembers(headers, OrganizationId.make("missing"))),
      new Access.NotFound({}),
    );
    assert.strictEqual(yield* organizations.role(headers, shared), "viewer");
    assert.deepStrictEqual(
      yield* Effect.flip(organizations.role(headers, foreign)),
      new Access.NotFound({}),
    );

    yield* sql`UPDATE member SET role = 'owner,member' WHERE id = 'auth-members-viewer'`;

    assert.instanceOf(
      yield* Effect.flip(organizations.role(headers, shared)),
      Organizations.Unavailable,
    );
    assert.instanceOf(
      yield* Effect.flip(organizations.listMembers(headers, shared)),
      Organizations.Unavailable,
    );
  }).pipe(Effect.scoped, Effect.provide(postgres)),
);

it.live("invites by email and resends a pending invitation", () =>
  Effect.gen(function* () {
    const messages: Email.Message[] = [];
    const { organizations, sql, headers } = yield* fixture("192.0.2.50", {
      send: (message) =>
        Effect.sync(() => {
          messages.push(message);
        }),
    });
    const cleanup = sql`DELETE FROM organization WHERE name = 'auth-invite-own'`;
    yield* Effect.acquireRelease(cleanup, () => cleanup.pipe(Effect.orDie));
    const organization = yield* organizations.create(headers, { name: "auth-invite-own" });
    const input = { email: "invitee@moku.test", role: "viewer" } as const;

    yield* organizations.invite(headers, organization.id, input);
    yield* organizations.invite(headers, organization.id, input);

    const invitations = yield* sql<{ id: string }>`
      SELECT id FROM invitation
      WHERE organization_id = ${organization.id} AND email = 'invitee@moku.test'
        AND role = 'viewer' AND status = 'pending'
    `;
    assert.strictEqual(invitations.length, 1);
    const link = `${origin}/invitations/${invitations[0]?.id}`;
    assert.deepStrictEqual(
      messages.map((message) => [message.to, Redacted.value(message.text).split("\n")[0]]),
      [
        ["invitee@moku.test", link],
        ["invitee@moku.test", link],
      ],
    );
  }).pipe(Effect.scoped, Effect.provide(postgres)),
);

it.live("lets owners and admins invite and rejects everyone else", () =>
  Effect.gen(function* () {
    const { organizations, sql, headers } = yield* fixture("192.0.2.51");
    const cleanup = sql`DELETE FROM organization WHERE name LIKE 'auth-invite-%'`;
    yield* Effect.acquireRelease(cleanup, () => cleanup.pipe(Effect.orDie));
    yield* peer();
    const foreign = yield* peerOrganization("auth-invite-foreign");
    const shared = yield* peerOrganization("auth-invite-shared");
    yield* sql`INSERT INTO member (id, organization_id, user_id, role, created_at)
      VALUES ('auth-invite-caller', ${shared}, 'authentication-test', 'viewer', now())`;
    const asRole = (role: string) =>
      sql`UPDATE member SET role = ${role} WHERE id = 'auth-invite-caller'`;
    const invite = (organizationId: OrganizationId, email: string, role: "owner" | "member") =>
      Effect.flip(organizations.invite(headers, organizationId, { email, role }));

    assert.deepStrictEqual(
      yield* invite(foreign, "new@moku.test", "member"),
      new Access.NotFound({}),
    );
    assert.deepStrictEqual(yield* invite(shared, "new@moku.test", "member"), new Access.Denied({}));
    yield* asRole("member");
    assert.deepStrictEqual(yield* invite(shared, "new@moku.test", "member"), new Access.Denied({}));
    yield* asRole("admin");
    assert.deepStrictEqual(yield* invite(shared, "new@moku.test", "owner"), new Access.Denied({}));
    assert.deepStrictEqual(
      yield* invite(shared, "peer@moku.test", "member"),
      new Organizations.AlreadyMember({}),
    );
    yield* organizations.invite(headers, shared, { email: "new@moku.test", role: "member" });
  }).pipe(Effect.scoped, Effect.provide(postgres)),
);

const peerInvitation = Effect.fnUntraced(function* (
  id: string,
  organizationId: OrganizationId,
  email: string,
  expiresAt = new Date(Date.now() + 86_400_000),
) {
  const sql = yield* PgClient.PgClient;
  yield* sql`INSERT INTO invitation (id, organization_id, email, role, status, expires_at, inviter_id)
    VALUES (${id}, ${organizationId}, ${email}, 'admin', 'pending', ${expiresAt}, 'organization-peer')`;

  return id;
});

it.live("shows and accepts the recipient's pending invitation once", () =>
  Effect.gen(function* () {
    const { organizations, sql, headers } = yield* fixture("192.0.2.60");
    const cleanup = sql`DELETE FROM organization WHERE name = 'auth-accept-org'`;
    yield* Effect.acquireRelease(cleanup, () => cleanup.pipe(Effect.orDie));
    yield* peer();
    const organization = yield* peerOrganization("auth-accept-org");
    const invitation = yield* peerInvitation("auth-accept", organization, credentials.email);

    assert.deepStrictEqual(yield* organizations.getInvitation(headers, invitation), {
      organizationName: "auth-accept-org",
      inviterEmail: "peer@moku.test",
      role: "admin",
    });
    assert.strictEqual(yield* organizations.acceptInvitation(headers, invitation), organization);
    assert.strictEqual(yield* organizations.role(headers, organization), "admin");
    assert.deepStrictEqual(
      yield* Effect.flip(organizations.acceptInvitation(headers, invitation)),
      new Organizations.InvitationInvalid({}),
    );
  }).pipe(Effect.scoped, Effect.provide(postgres)),
);

it.live("rejects another recipient's and expired invitations", () =>
  Effect.gen(function* () {
    const { organizations, sql, headers } = yield* fixture("192.0.2.61");
    const cleanup = sql`DELETE FROM organization WHERE name = 'auth-reject-org'`;
    yield* Effect.acquireRelease(cleanup, () => cleanup.pipe(Effect.orDie));
    yield* peer();
    const organization = yield* peerOrganization("auth-reject-org");
    const other = yield* peerInvitation("auth-reject-other", organization, "someone@moku.test");
    const expired = yield* peerInvitation(
      "auth-reject-expired",
      organization,
      credentials.email,
      new Date(Date.now() - 86_400_000),
    );

    assert.deepStrictEqual(
      yield* Effect.flip(organizations.getInvitation(headers, other)),
      new Organizations.NotRecipient({}),
    );
    assert.deepStrictEqual(
      yield* Effect.flip(organizations.acceptInvitation(headers, other)),
      new Organizations.NotRecipient({}),
    );
    assert.deepStrictEqual(
      yield* Effect.flip(organizations.getInvitation(headers, expired)),
      new Organizations.InvitationInvalid({}),
    );
    assert.deepStrictEqual(
      yield* Effect.flip(organizations.role(headers, organization)),
      new Access.NotFound({}),
    );
  }).pipe(Effect.scoped, Effect.provide(postgres)),
);
