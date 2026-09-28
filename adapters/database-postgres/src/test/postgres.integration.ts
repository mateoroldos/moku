import { PgClient } from "@effect/sql-pg";
import { assert, it } from "@effect/vitest";
import { HumanTaskStore } from "@moku/core/human-task-store";
import { HumanTaskId, HumanTaskTitle, PendingHumanTask } from "@moku/domain/human-task";
import { makeWithDefaults } from "drizzle-orm/effect-postgres";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import { Config, DateTime, Effect, Layer, Result } from "effect";
import { migrationConfig } from "../migrations.ts";
import { PersistencePostgres } from "../persistence-postgres.ts";

const postgres = Layer.unwrap(
  Config.redacted("TEST_DATABASE_URL").pipe(
    Effect.map((url) =>
      PgClient.layer({ url, maxConnections: 1, types: PersistencePostgres.typeParsers }),
    ),
  ),
);
const persistence = PersistencePostgres.layer.pipe(Layer.provide(postgres));

it.live("migrates repeatedly, arbitrates independent connections, and survives reconnection", () =>
  Effect.gen(function* () {
    yield* Effect.gen(function* () {
      const database = yield* makeWithDefaults();
      yield* migrate(database, migrationConfig);
      yield* migrate(database, migrationConfig);
    }).pipe(Effect.provide(postgres));

    const task = PendingHumanTask.make({
      id: HumanTaskId.make("00000000-0000-4000-8000-000000000099"),
      intent: "authorize",
      subject: { title: HumanTaskTitle.make("Concurrent PostgreSQL review") },
      response: { type: "approval" },
      createdAt: DateTime.makeUnsafe("2026-09-28T12:00:00.123Z"),
      status: "pending",
    });
    // This suite requires a disposable database; remove only its own fixed task.
    const cleanup = Effect.gen(function* () {
      const sql = yield* PgClient.PgClient;
      yield* sql`DELETE FROM human_tasks WHERE id = ${task.id}`;
    }).pipe(Effect.provide(postgres));
    yield* cleanup;
    yield* Effect.gen(function* () {
      const inserted = yield* Effect.forEach(
        [0, 1],
        () =>
          Effect.gen(function* () {
            const store = yield* HumanTaskStore.Service;
            return yield* Effect.result(store.create(task));
          }).pipe(Effect.provide(persistence)),
        { concurrency: "unbounded" },
      );
      assert.lengthOf(inserted.filter(Result.isSuccess), 1);
      const outcomes = yield* Effect.forEach(
        ["approved", "rejected"] as const,
        (decision) =>
          Effect.gen(function* () {
            const store = yield* HumanTaskStore.Service;
            return yield* Effect.result(
              store.complete(
                task.id,
                { decision },
                DateTime.makeUnsafe("2026-09-28T13:00:00.456Z"),
              ),
            );
          }).pipe(Effect.provide(persistence)),
        { concurrency: "unbounded" },
      );
      const winners = outcomes.filter(Result.isSuccess).map((outcome) => outcome.success);
      assert.lengthOf(winners, 1);
      assert.deepStrictEqual(
        outcomes.filter(Result.isFailure).map((outcome) => outcome.failure),
        [new HumanTaskStore.AlreadyCompleted({ id: task.id })],
      );
      // Every provide above has closed its pool before this new connection reads the result.
      yield* Effect.gen(function* () {
        const store = yield* HumanTaskStore.Service;
        assert.deepStrictEqual([yield* store.get(task.id)], winners);
        const missing = HumanTaskId.make("00000000-0000-4000-8000-000000000098");
        assert.deepStrictEqual(
          yield* Effect.flip(store.complete(missing, { decision: "approved" }, task.createdAt)),
          new HumanTaskStore.NotFound({ id: missing }),
        );
      }).pipe(Effect.provide(persistence));
    }).pipe(Effect.ensuring(cleanup.pipe(Effect.orDie)));
  }),
);
