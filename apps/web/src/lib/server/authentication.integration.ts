import { PgClient } from "@effect/sql-pg";
import { assert, it } from "@effect/vitest";
import { AuthStorage } from "@moku/database-postgres/auth-storage";
import { PostgresConnection } from "@moku/database-postgres/postgres-connection";
import { hashPassword } from "better-auth/crypto";
import { Config, Effect, Layer } from "effect";
import { Authentication } from "./authentication.ts";

it.live("enforces verified login, origin policy, revocation and unavailable auth", () =>
  Effect.gen(function* () {
    const sql = yield* PgClient.PgClient;
    const storage = yield* AuthStorage.Service;
    let outage: "none" | "read" | "delete" = "none";
    const database = Layer.succeed(AuthStorage.Service, (options) => {
      const adapter = storage(options);
      return {
        ...adapter,
        findOne: (input) =>
          outage === "read"
            ? Promise.reject(new Error("database unavailable"))
            : adapter.findOne(input),
        delete: (input) =>
          outage === "delete"
            ? Promise.reject(new Error("database unavailable"))
            : adapter.delete(input),
      };
    });
    const auth = yield* Authentication.Service.pipe(
      Effect.provide(Authentication.layer.pipe(Layer.provide(database))),
    );
    const request = (path: string, headers = new Headers(), body = {}) =>
      new Request(`http://localhost:3000/api/auth/${path}`, {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
          ...Object.fromEntries(headers),
        },
        body: JSON.stringify(body),
      });
    const credentials = { email: "auth-integration@moku.test", password: "integration-password" };
    const hash = yield* Effect.promise(() => hashPassword(credentials.password));
    yield* sql`INSERT INTO "user" (id, name, email, email_verified) VALUES ('auth-integration', 'Reviewer', ${credentials.email}, true)`;
    yield* Effect.gen(function* () {
      yield* sql`INSERT INTO account (id, account_id, provider_id, user_id, password, updated_at) VALUES ('auth-integration', 'auth-integration', 'credential', 'auth-integration', ${hash}, now())`;
      assert.strictEqual(yield* auth.authenticate(new Headers()), null);
      assert.propertyVal(
        assert.throws(() => Authentication.requireVerified(null)),
        "status",
        401,
      );
      assert.strictEqual(
        (yield* auth.handle(request("sign-up/email", new Headers(), credentials))).status,
        404,
      );
      assert.strictEqual(
        (yield* auth.handle(
          request("sign-in/email", new Headers({ origin: "https://outsider.test" }), credentials),
        )).status,
        403,
      );
      assert.strictEqual(
        (yield* auth.handle(
          request("sign-in/email", new Headers(), { ...credentials, password: "wrong" }),
        )).status,
        401,
      );
      const login = yield* auth.handle(request("sign-in/email", new Headers(), credentials));
      assert.strictEqual(login.status, 200);
      const cookie = login.headers.get("set-cookie") ?? "";
      assert.include(cookie, "HttpOnly");
      assert.include(cookie, "SameSite=Lax");
      assert.include(cookie, "Max-Age=604800");
      assert.notInclude(cookie, "Domain=");
      const headers = new Headers({ cookie: cookie.split(";")[0] ?? "" });
      assert.deepStrictEqual(yield* auth.authenticate(headers), {
        id: "auth-integration",
        emailVerified: true,
      });
      yield* sql`UPDATE "user" SET email_verified = false WHERE id = 'auth-integration'`;
      assert.propertyVal(
        assert.throws(() =>
          Authentication.requireVerified({ id: "auth-integration", emailVerified: false }),
        ),
        "status",
        403,
      );
      assert.deepStrictEqual(yield* auth.authenticate(headers), {
        id: "auth-integration",
        emailVerified: false,
      });
      assert.strictEqual(
        (yield* auth.handle(request("sign-in/email", new Headers(), credentials))).status,
        403,
      );
      yield* sql`UPDATE "user" SET email_verified = true WHERE id = 'auth-integration'`;
      outage = "read";
      assert.strictEqual(
        (yield* auth.authenticate(headers).pipe(Effect.flip))._tag,
        "Authentication.Unavailable",
      );
      assert.strictEqual(
        (yield* auth.handle(request("sign-out", headers)).pipe(Effect.flip))._tag,
        "Authentication.Unavailable",
      );
      assert.strictEqual(
        (yield* auth.handle(request("sign-in/email", new Headers(), credentials)).pipe(Effect.flip))
          ._tag,
        "Authentication.Unavailable",
      );
      outage = "delete";
      assert.strictEqual(
        (yield* auth.handle(request("sign-out", headers)).pipe(Effect.flip))._tag,
        "Authentication.Unavailable",
      );
      outage = "none";
      assert.deepStrictEqual(yield* auth.authenticate(headers), {
        id: "auth-integration",
        emailVerified: true,
      });
      assert.strictEqual((yield* auth.handle(request("sign-out", headers))).status, 200);
      assert.strictEqual(yield* auth.authenticate(headers), null);
    }).pipe(
      Effect.ensuring(sql`DELETE FROM "user" WHERE id = 'auth-integration'`.pipe(Effect.orDie)),
    );
  }).pipe(
    Effect.provide(
      Layer.unwrap(
        Config.redacted("TEST_DATABASE_URL").pipe(
          Effect.map((url) =>
            PostgresConnection.layer({ url, applicationName: "moku-auth-test", maxConnections: 2 }),
          ),
        ),
      ),
    ),
  ),
);
