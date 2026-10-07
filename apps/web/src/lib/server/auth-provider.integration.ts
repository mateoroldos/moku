/* oxlint-disable effecttsgo/prefer-schema-over-json -- Exercise raw provider HTTP inputs. */
import { PgClient } from "@effect/sql-pg";
import { assert, it } from "@effect/vitest";
import { Access } from "@moku/core/access";
import { Email } from "@moku/core/email";
import { Invitations } from "@moku/core/invitations";
import { OrganizationAccess } from "@moku/core/organization-access";
import { OrganizationCreation } from "@moku/core/organization-creation";
import { PersistencePostgres } from "@moku/database-postgres";
import { AuthStorage } from "@moku/database-postgres/auth-storage";
import { UserId } from "@moku/domain/identity";
import { PostgresConnection } from "@moku/database-postgres/postgres-connection";
import { hashPassword } from "better-auth/crypto";
import { Config, Effect, Layer, Logger, Redacted } from "effect";
import { AuthProvider } from "./auth-provider.ts";

const invitationAccess = OrganizationAccess.layer.pipe(Layer.provide(PersistencePostgres.layer));

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
  const { auth, creation } = yield* Effect.gen(function* () {
    const auth = yield* AuthProvider.Service;
    const creation = yield* OrganizationCreation.Service;

    return { auth, creation };
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
    creation,
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

it.live("creates a short-ID organization with the caller as its owner", () =>
  Effect.gen(function* () {
    const { creation, sql } = yield* fixture("192.0.2.7");
    const cleanup = sql`DELETE FROM organization WHERE name = 'auth-creation-test'`;
    yield* Effect.acquireRelease(cleanup, () => cleanup.pipe(Effect.orDie));

    const organization = yield* creation.createWithOwner(UserId.make("authentication-test"), {
      name: "auth-creation-test",
    });

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

it.live("rolls back organization creation when its owner cannot be stored", () =>
  Effect.gen(function* () {
    const { creation, sql } = yield* fixture("192.0.2.8");
    const cleanup = sql`DELETE FROM organization WHERE name = 'auth-rollback-test'`;
    yield* Effect.acquireRelease(cleanup, () => cleanup.pipe(Effect.orDie));
    yield* Effect.acquireRelease(
      sql`CREATE FUNCTION pg_temp.reject_auth_test_owner() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.user_id = 'authentication-test' THEN
            RAISE EXCEPTION 'organization-owner-write-probe';
          END IF;
          RETURN NEW;
        END $$`.pipe(
        Effect.andThen(sql`
          CREATE TRIGGER reject_auth_test_owner BEFORE INSERT ON member
          FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_auth_test_owner()
        `),
      ),
      () => sql`DROP TRIGGER IF EXISTS reject_auth_test_owner ON member`.pipe(Effect.orDie),
    );

    const failure = yield* Effect.flip(
      creation.createWithOwner(UserId.make("authentication-test"), { name: "auth-rollback-test" }),
    );

    assert.nestedPropertyVal(
      Redacted.value(failure.cause),
      "cause.message",
      "organization-owner-write-probe",
    );
    assert.deepStrictEqual(
      yield* sql`SELECT id FROM organization WHERE name = 'auth-rollback-test'`,
      [],
    );
    assert.deepStrictEqual(
      yield* sql`SELECT id FROM member WHERE user_id = 'authentication-test'`,
      [],
    );
  }).pipe(Effect.scoped, Effect.provide(postgres)),
);

const invitationFixture = Effect.fnUntraced(function* (delivery: Email.Interface) {
  const { auth, creation, sql, headers } = yield* fixture("192.0.2.30", delivery);
  const cleanup = sql`DELETE FROM organization WHERE name = 'invitation-test'`;
  yield* Effect.acquireRelease(cleanup, () => cleanup.pipe(Effect.orDie));
  const organization = yield* creation.createWithOwner(UserId.make("authentication-test"), {
    name: "invitation-test",
  });
  yield* sql`INSERT INTO "user" (id, name, email, email_verified) VALUES ('invitation-recipient', 'Recipient', ${signup.email}, true)`;
  yield* sql`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
    SELECT 'invitation-recipient', 'invitation-recipient', 'credential', 'invitation-recipient', password, now(), now()
    FROM account WHERE id = 'authentication-test'`;
  const response = yield* auth.handle(
    request(
      "sign-in/email",
      new Headers(),
      JSON.stringify({ email: signup.email, password: credentials.password }),
    ),
    "192.0.2.31",
  );
  assert.strictEqual(response.status, 200);
  const recipientHeaders = new Headers({
    cookie: response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; "),
  });
  const sender = yield* auth.invitationSession(headers);
  const recipient = yield* auth.invitationSession(recipientHeaders);
  assert(sender);
  assert(recipient);

  return {
    auth,
    sql,
    sender,
    recipient,
    recipientHeaders,
    input: {
      organizationId: organization.id,
      email: signup.email,
      role: "viewer",
      resend: false,
    } satisfies Invitations.CreateInput,
  };
});

it.live("delivers an invitation and grants its role only to the verified recipient", () =>
  Effect.gen(function* () {
    const messages: Email.Message[] = [];
    const { auth, sql, sender, recipient, recipientHeaders, input } = yield* invitationFixture({
      send: (message) =>
        Effect.sync(() => {
          messages.push(message);
        }),
    });
    const id = yield* Invitations.create(sender, input);
    assert.deepStrictEqual(
      messages.map(({ to, subject }) => ({ to, subject })),
      [{ to: signup.email, subject: "Join invitation-test on Moku" }],
    );
    const message = messages[0];
    assert(message);
    assert.include(Redacted.value(message.text), `${origin}/invitations/${id}`);
    assert.deepStrictEqual(
      yield* Effect.flip(Invitations.create(sender, input)),
      new Invitations.Rejected({ reason: "AlreadyInvited" }),
    );
    assert.deepStrictEqual(
      yield* Effect.flip(Invitations.accept(sender, id)),
      new Invitations.Rejected({ reason: "WrongRecipient" }),
    );

    yield* sql`UPDATE "user" SET email_verified = false WHERE id = 'invitation-recipient'`;
    const unverified = yield* auth.invitationSession(recipientHeaders);
    assert(unverified);
    assert.strictEqual(
      (yield* Effect.flip(Invitations.accept(unverified, id)))._tag,
      "Access.UnverifiedEmail",
    );
    assert.deepStrictEqual(
      yield* Effect.flip(unverified.accept(id)),
      new Invitations.Rejected({ reason: "UnverifiedEmail" }),
    );
    yield* sql`UPDATE "user" SET email_verified = true WHERE id = 'invitation-recipient'`;

    assert.deepStrictEqual(yield* Invitations.accept(recipient, id), {
      userId: "invitation-recipient",
      organizationId: input.organizationId,
      role: "viewer",
    });
    assert.deepStrictEqual(
      yield* sql`SELECT role FROM member WHERE user_id = 'invitation-recipient' AND organization_id = ${input.organizationId}`,
      [{ role: "viewer" }],
    );
    assert.deepStrictEqual(
      yield* Effect.flip(Invitations.accept(recipient, id)),
      new Invitations.Rejected({ reason: "InvalidInvitation" }),
    );
    assert.deepStrictEqual(
      yield* Effect.flip(Invitations.create(sender, input)),
      new Invitations.Rejected({ reason: "AlreadyMember" }),
    );
    assert.strictEqual(yield* auth.invitationSession(new Headers()), null);
    yield* sql`DELETE FROM session WHERE user_id = 'authentication-test'`;
    assert.deepStrictEqual(
      yield* Effect.flip(Invitations.create(sender, input)),
      new Invitations.Rejected({ reason: "SessionRequired" }),
    );
  }).pipe(Effect.provide(invitationAccess), Effect.scoped, Effect.provide(postgres)),
);

it.live("keeps failed delivery pending and resends the same invitation", () =>
  Effect.gen(function* () {
    let fail = true;
    const messages: Email.Message[] = [];
    const { sql, sender, recipient, input } = yield* invitationFixture({
      send: (message) =>
        fail
          ? Effect.fail(new Email.Unavailable({ cause: Redacted.make("delivery offline") }))
          : Effect.sync(() => {
              messages.push(message);
            }),
    });
    const created = yield* Invitations.create(sender, input);
    const pending =
      yield* sql`SELECT id, status FROM invitation WHERE organization_id = ${input.organizationId}`;
    assert.lengthOf(pending, 1);
    assert.strictEqual(pending[0]?.id, created);
    assert.strictEqual(pending[0]?.status, "pending");

    fail = false;
    const id = yield* Invitations.create(sender, { ...input, resend: true });
    assert.strictEqual(id, pending[0]?.id);
    assert.lengthOf(messages, 1);
    yield* sql`UPDATE invitation SET expires_at = '2000-01-01' WHERE id = ${id}`;
    assert.deepStrictEqual(
      yield* Effect.flip(Invitations.accept(recipient, id)),
      new Invitations.Rejected({ reason: "InvalidInvitation" }),
    );
    assert.deepStrictEqual(
      yield* sql`SELECT role FROM member WHERE user_id = 'invitation-recipient'`,
      [],
    );
  }).pipe(Effect.provide(invitationAccess), Effect.scoped, Effect.provide(postgres)),
);

it.live(
  "restricts invitations to verified owners and admins, with owner grants reserved for owners",
  () =>
    Effect.gen(function* () {
      const { sql, sender, input } = yield* invitationFixture({ send: () => Effect.void });
      yield* sql`UPDATE member SET role = 'admin' WHERE user_id = 'authentication-test'`;
      assert.deepStrictEqual(
        yield* Effect.flip(Invitations.create(sender, { ...input, role: "owner" })),
        new Access.Denied({}),
      );
      const id = yield* Invitations.create(sender, input);
      assert.deepStrictEqual(yield* sql`SELECT role, inviter_id FROM invitation WHERE id = ${id}`, [
        { role: "viewer", inviter_id: "authentication-test" },
      ]);

      yield* sql`UPDATE member SET role = 'viewer' WHERE user_id = 'authentication-test'`;
      assert.deepStrictEqual(
        yield* Effect.flip(Invitations.create(sender, { ...input, resend: true })),
        new Access.Denied({}),
      );
      yield* sql`DELETE FROM member WHERE user_id = 'authentication-test'`;
      assert.deepStrictEqual(
        yield* Effect.flip(Invitations.create(sender, input)),
        new Access.NotFound({}),
      );
    }).pipe(Effect.provide(invitationAccess), Effect.scoped, Effect.provide(postgres)),
);
