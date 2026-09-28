import { PgClient } from "@effect/sql-pg";
import { assert, it } from "@effect/vitest";
import { HumanTaskDirectory } from "@moku/core/human-task-directory";
import { Config, Effect, Layer, Schema } from "effect";
import { WebRuntime } from "./runtime.ts";

const observer = Layer.unwrap(
  Config.redacted("TEST_DATABASE_URL").pipe(Effect.map((url) => PgClient.layer({ url }))),
);

it.live("persists across server runtimes and releases their PostgreSQL connections", () =>
  Effect.gen(function* () {
    const url = yield* Config.redacted("TEST_DATABASE_URL");
    const sql = yield* PgClient.PgClient;
    const acquire = Effect.acquireRelease(
      Effect.sync(() => WebRuntime.make(url)),
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
