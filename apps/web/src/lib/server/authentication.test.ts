import { PGlite } from "@electric-sql/pglite";
import { assert, it } from "@effect/vitest";
import * as authSchema from "@moku/database-postgres/auth-schema";
import { migrationConfig } from "@moku/database-postgres/migrations";
import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { DateTime, Effect, Redacted, Schema } from "effect";
import { Authentication } from "./authentication.ts";

const origin = new URL("https://moku.example");
const secret = Redacted.make("auth-test-secret-with-at-least-32-characters");
const credentials = { email: "ada@example.com", password: "correct-horse-battery-staple" };
const fixture = Effect.gen(function* () {
  const client = yield* Effect.acquireRelease(
    Effect.promise(() => PGlite.create()),
    (value) => Effect.promise(() => value.close()),
  );
  const database = drizzle({ client, relations: { ...authSchema.authRelations } });
  yield* Effect.promise(() => migrate(database, migrationConfig));
  const password = yield* Effect.promise(() => hashPassword(credentials.password));
  yield* Effect.promise(() =>
    database.insert(authSchema.user).values({
      id: "ada",
      name: "Ada",
      email: credentials.email,
      emailVerified: true,
    }),
  );
  yield* Effect.promise(() =>
    database.insert(authSchema.account).values({
      id: "ada-credential",
      userId: "ada",
      accountId: "ada",
      providerId: "credential",
      password,
    }),
  );
  const auth = Authentication.make(database, { origin, secret });
  const request = (
    path: string,
    body?: Readonly<Record<string, string>>,
    cookie = "",
    requestOrigin = origin.origin,
  ) => {
    const init: RequestInit = {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", origin: requestOrigin, cookie },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    return auth.handle(new Request(new URL(`/api/auth/${path}`, origin), init));
  };
  const signIn = Effect.gen(function* () {
    const response = yield* request("sign-in/email", credentials);
    assert.equal(response.status, 200);
    const cookies = response.headers.getSetCookie();
    const sessionCookie = cookies.find((cookie) =>
      cookie.startsWith("__Secure-moku.session_token="),
    );
    assert.isDefined(sessionCookie);
    assert.include(sessionCookie, "HttpOnly");
    assert.include(sessionCookie, "Secure");
    assert.include(sessionCookie, "SameSite=Lax");
    assert.include(sessionCookie, "Path=/");
    return cookies.map((value) => value.slice(0, value.indexOf(";"))).join("; ");
  });
  return { request, signIn, database };
});

it.live("persists absolute sessions, isolates requests, and invalidates signed-out cookies", () =>
  Effect.gen(function* () {
    const { request, signIn, database } = yield* fixture;
    const cookie = yield* signIn;
    const [stored] = yield* Effect.promise(() => database.select().from(authSchema.session));
    assert.isDefined(stored);
    if (stored === undefined) return;
    // The provider reads its wall clock separately for creation and expiry.
    assert.closeTo(
      stored.expiresAt.getTime() - stored.createdAt.getTime(),
      7 * 24 * 60 * 60 * 1000,
      1000,
    );
    // Force the provider's normal sliding-renewal threshold to have elapsed.
    const expiresAt = DateTime.toDateUtc(DateTime.add(yield* DateTime.now, { hours: 1 }));
    yield* Effect.promise(() => database.update(authSchema.session).set({ expiresAt }));
    const response = yield* request("get-session", undefined, cookie);
    assert.equal(response.status, 200);
    const body = yield* Effect.promise(() => response.json()).pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.Struct({
            user: Schema.Struct({
              id: Schema.String,
              email: Schema.String,
              emailVerified: Schema.Boolean,
            }),
          }),
        ),
      ),
    );
    assert.deepEqual(body.user, { id: "ada", email: "ada@example.com", emailVerified: true });
    assert.deepEqual(response.headers.getSetCookie(), []);
    const [unchanged] = yield* Effect.promise(() => database.select().from(authSchema.session));
    assert.equal(unchanged?.expiresAt.getTime(), expiresAt.getTime());
    const anonymous = yield* request("get-session");
    assert.isNull(yield* Effect.promise(() => anonymous.json()));
    const tampered = yield* request(
      "get-session",
      undefined,
      cookie.replace("session_token=", "session_token=tampered"),
    );
    assert.isNull(yield* Effect.promise(() => tampered.json()));
    const signedOut = yield* request("sign-out", {}, cookie);
    assert.equal(signedOut.status, 200);
    assert.isTrue(
      signedOut.headers
        .getSetCookie()
        .some(
          (value) =>
            value.startsWith("__Secure-moku.session_token=") && value.includes("Max-Age=0"),
        ),
    );
    const revoked = yield* request("get-session", undefined, cookie);
    assert.isNull(yield* Effect.promise(() => revoked.json()));
  }),
);

it.live(
  "rejects unverified credentials, wrong passwords, untrusted origins, and unopened endpoints",
  () =>
    Effect.gen(function* () {
      const { request, database } = yield* fixture;
      const wrong = yield* request("sign-in/email", { ...credentials, password: "wrong-password" });
      assert.equal(wrong.status, 401);
      assert.propertyVal(
        yield* Effect.promise(() => wrong.json()),
        "code",
        "INVALID_EMAIL_OR_PASSWORD",
      );
      const foreign = yield* request("sign-in/email", credentials, "", "https://attacker.example");
      assert.equal(foreign.status, 403);
      assert.propertyVal(yield* Effect.promise(() => foreign.json()), "code", "INVALID_ORIGIN");
      const redirect = yield* request("sign-in/email", {
        ...credentials,
        callbackURL: "https://attacker.example",
      });
      assert.equal(redirect.status, 403);
      assert.propertyVal(
        yield* Effect.promise(() => redirect.json()),
        "code",
        "INVALID_CALLBACK_URL",
      );
      // Isolate the verification guard from the preceding attempts' shared rate-limit bucket.
      yield* Effect.promise(() => database.delete(authSchema.rateLimit));
      yield* Effect.promise(() =>
        database
          .update(authSchema.user)
          .set({ emailVerified: false })
          .where(eq(authSchema.user.id, "ada")),
      );
      const unverified = yield* request("sign-in/email", credentials);
      assert.equal(unverified.status, 403);
      assert.propertyVal(
        yield* Effect.promise(() => unverified.json()),
        "code",
        "EMAIL_NOT_VERIFIED",
      );
      for (const path of [
        "sign-up/email",
        "delete-user",
        "change-password",
        "organization/create",
      ]) {
        const blocked = yield* request(path, credentials);
        assert.equal(blocked.status, 404);
        assert.deepEqual(blocked.headers.getSetCookie(), []);
      }
      assert.deepEqual(yield* Effect.promise(() => database.select().from(authSchema.session)), []);
    }),
);

it.live("rejects expired sessions and distinguishes a database outage from anonymous access", () =>
  Effect.gen(function* () {
    const { request, signIn, database } = yield* fixture;
    const cookie = yield* signIn;
    yield* Effect.promise(() =>
      database
        .update(authSchema.session)
        .set({ expiresAt: DateTime.toDateUtc(DateTime.makeUnsafe(0)) }),
    );
    const expired = yield* request("get-session", undefined, cookie);
    assert.isNull(yield* Effect.promise(() => expired.json()));
    const current = yield* signIn;
    yield* Effect.promise(() => database.execute(sql`drop table "session"`));
    const failure = yield* request("get-session", undefined, current).pipe(Effect.flip);
    assert.instanceOf(failure, Authentication.Unavailable);
  }),
);
