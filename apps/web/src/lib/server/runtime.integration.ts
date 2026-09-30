import { PgClient } from "@effect/sql-pg";
import { assert, it } from "@effect/vitest";
import { HumanTaskDirectory } from "@moku/core/human-task-directory";
import { hashPassword } from "better-auth/crypto";
import { Config, Effect, Layer, Redacted, Schema } from "effect";
import { WebRuntime } from "./runtime.ts";
import { Authentication } from "./authentication.ts";

const observer = Layer.unwrap(
  Config.redacted("TEST_DATABASE_URL").pipe(Effect.map((url) => PgClient.layer({ url }))),
);

it.live("persists provider sessions across runtimes using the application PostgreSQL pool", () =>
  Effect.gen(function* () {
    const url = yield* Config.redacted("TEST_DATABASE_URL");
    const sql = yield* PgClient.PgClient;
    const origin = new URL("http://localhost:5173");
    const secret = Redacted.make("runtime-test-secret-with-at-least-32-characters");
    const password = yield* Effect.promise(() => hashPassword("runtime-test-password"));
    const cleanup = sql`DELETE FROM "user" WHERE id = 'runtime-auth-user'`;
    yield* cleanup;
    yield* Effect.gen(function* () {
      yield* sql`INSERT INTO "user" (id, name, email, email_verified)
        VALUES ('runtime-auth-user', 'Runtime', 'runtime@example.com', true)`;
      yield* sql`INSERT INTO account (id, account_id, provider_id, user_id, password, updated_at)
        VALUES ('runtime-auth-account', 'runtime-auth-user', 'credential', 'runtime-auth-user', ${password}, now())`;
      const acquire = Effect.acquireRelease(
        Effect.sync(() => WebRuntime.make(url, { origin, secret })),
        (runtime) => Effect.promise(() => runtime.dispose()),
      );
      const cookie = yield* Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* acquire;
          const request = new Request(new URL("/api/auth/sign-in/email", origin), {
            method: "POST",
            headers: { "content-type": "application/json", origin: origin.origin },
            body: '{"email":"runtime@example.com","password":"runtime-test-password"}',
          });
          const response = yield* Effect.promise(() =>
            runtime.runPromise(Authentication.Service.use((auth) => auth.handle(request))),
          );
          assert.equal(response.status, 200);
          return response.headers
            .getSetCookie()
            .map((value) => value.slice(0, value.indexOf(";")))
            .join("; ");
        }),
      );
      yield* Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* acquire;
          const request = new Request(new URL("/api/auth/get-session", origin), {
            headers: { cookie },
          });
          const response = yield* Effect.promise(() =>
            runtime.runPromise(Authentication.Service.use((auth) => auth.handle(request))),
          );
          assert.equal(response.status, 200);
          const body = yield* Effect.promise(() => response.json()).pipe(
            Effect.flatMap(
              Schema.decodeUnknownEffect(
                Schema.Struct({
                  user: Schema.Struct({ id: Schema.String }),
                  session: Schema.Struct({ expiresAt: Schema.DateTimeUtcFromString }),
                }),
              ),
            ),
          );
          assert.equal(body.user.id, "runtime-auth-user");
          // Both Drizzle clients share this runtime's pool; application reads still decode correctly.
          yield* Effect.promise(() =>
            runtime.runPromise(HumanTaskDirectory.Service.use((directory) => directory.list)),
          );
          const connections = yield* sql`SELECT pid FROM pg_stat_activity
          WHERE datname = current_database() AND application_name = 'moku-web'`;
          assert.lengthOf(connections, 1);
        }),
      );
      const remaining = yield* sql`SELECT pid FROM pg_stat_activity
        WHERE datname = current_database() AND application_name = 'moku-web'`;
      assert.lengthOf(remaining, 0);
    }).pipe(Effect.ensuring(cleanup.pipe(Effect.orDie)));
  }).pipe(Effect.provide(observer)),
);

it.live("persists across server runtimes and releases their PostgreSQL connections", () =>
  Effect.gen(function* () {
    const url = yield* Config.redacted("TEST_DATABASE_URL");
    const sql = yield* PgClient.PgClient;
    const acquire = Effect.acquireRelease(
      Effect.sync(() =>
        WebRuntime.make(url, {
          origin: new URL("http://localhost:5173"),
          secret: Redacted.make("runtime-test-secret-with-at-least-32-characters"),
        }),
      ),
      (runtime) => Effect.promise(() => runtime.dispose()),
    );
    const input = yield* Schema.decodeEffect(HumanTaskDirectory.CreateInput)({
      intent: "authorize",
      subject: { title: "Runtime persistence verification" },
      response: { type: "approval" },
    });
    const pending = yield* Effect.scoped(
      Effect.gen(function* () {
        const runtime = yield* acquire;
        return yield* Effect.promise(() =>
          runtime.runPromise(
            HumanTaskDirectory.Service.use((directory) => directory.create(input)),
          ),
        );
      }),
    );
    yield* Effect.gen(function* () {
      const connections = yield* sql`
        SELECT pid FROM pg_stat_activity
        WHERE datname = current_database() AND application_name = 'moku-web'
      `;
      assert.lengthOf(connections, 0);
      const completed = yield* Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* acquire;
          return yield* Effect.promise(() =>
            runtime.runPromise(
              Effect.gen(function* () {
                const directory = yield* HumanTaskDirectory.Service;
                assert.deepStrictEqual(yield* directory.get(pending.id), pending);
                return yield* directory.respond(pending.id, {
                  decision: "approved",
                  feedback: "Reviewed",
                });
              }),
            ),
          );
        }),
      );
      yield* Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* acquire;
          const saved = yield* Effect.promise(() =>
            runtime.runPromise(
              HumanTaskDirectory.Service.use((directory) => directory.get(pending.id)),
            ),
          );
          assert.deepStrictEqual(saved, completed);
        }),
      );
      const remaining = yield* sql`
        SELECT pid FROM pg_stat_activity
        WHERE datname = current_database() AND application_name = 'moku-web'
      `;
      assert.lengthOf(remaining, 0);
    }).pipe(
      Effect.ensuring(sql`DELETE FROM human_tasks WHERE id = ${pending.id}`.pipe(Effect.orDie)),
    );
  }).pipe(Effect.provide(observer)),
);
