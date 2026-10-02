/* oxlint-disable effecttsgo/prefer-schema-over-json -- Exercise raw provider HTTP inputs. */
import { PgClient } from "@effect/sql-pg";
import { assert, it } from "@effect/vitest";
import { AuthStorage } from "@moku/database-postgres/auth-storage";
import { PostgresConnection } from "@moku/database-postgres/postgres-connection";
import { hashPassword } from "better-auth/crypto";
import { Config, Effect, Layer } from "effect";
import { Authentication } from "./authentication.ts";

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

const fixture = Effect.fnUntraced(function* (clientAddress: string) {
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
  const auth = yield* Authentication.Service.pipe(
    Effect.provide(Authentication.layer.pipe(Layer.provide(database))),
  );
  const cleanup = sql`DELETE FROM "user" WHERE id = 'authentication-test'`;
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
    sql,
    headers,
    setUnavailable: (value: boolean) => {
      unavailable = value;
    },
  };
});

const verifiedUser = { id: "authentication-test", emailVerified: true };

it.live("decodes stored identity and rejects an expired session", () =>
  Effect.gen(function* () {
    const { auth, sql, headers } = yield* fixture("192.0.2.1");
    assert.deepStrictEqual(yield* auth.authenticate(headers), verifiedUser);
    yield* sql`UPDATE session SET expires_at = '2000-01-01' WHERE user_id = 'authentication-test'`;
    assert.strictEqual(yield* auth.authenticate(headers), null);
  }).pipe(Effect.scoped, Effect.provide(postgres)),
);

it.live("keeps lookup outages distinct from an absent session", () =>
  Effect.gen(function* () {
    const { auth, headers, setUnavailable } = yield* fixture("192.0.2.2");
    setUnavailable(true);
    assert.strictEqual(
      (yield* Effect.flip(auth.authenticate(headers)))._tag,
      "Authentication.Unavailable",
    );
    setUnavailable(false);
    assert.deepStrictEqual(yield* auth.authenticate(headers), verifiedUser);
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

it.live("requires the configured Origin for POSTs", () =>
  Effect.gen(function* () {
    const auth = yield* Authentication.Service;
    const missing = request("sign-in/email", new Headers(), JSON.stringify(credentials));
    missing.headers.delete("origin");
    assert.strictEqual((yield* auth.handle(missing, "127.0.0.1")).status, 403);
    const external = request(
      "sign-in/email",
      new Headers({ origin: "https://outsider.test" }),
      JSON.stringify(credentials),
    );
    assert.strictEqual((yield* auth.handle(external, "127.0.0.1")).status, 403);
  }).pipe(Effect.provide(Authentication.layer.pipe(Layer.provide(postgres)))),
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
