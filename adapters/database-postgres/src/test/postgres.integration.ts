import { PgClient } from "@effect/sql-pg";
import { assert, it } from "@effect/vitest";
import { HumanTaskStore } from "@moku/core/human-task-store";
import { HumanTaskId, HumanTaskTitle, PendingHumanTask } from "@moku/domain/human-task";
import { makeWithDefaults } from "drizzle-orm/effect-postgres";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import { Config, DateTime, Deferred, Effect, Fiber, Layer, Result, Schema } from "effect";
import { migrationConfig } from "../migrations.ts";
import { PersistencePostgres } from "../persistence-postgres.ts";

const postgres = Layer.unwrap(
  Config.redacted("TEST_DATABASE_URL").pipe(
    Effect.map((url) =>
      PgClient.layer({ url, maxConnections: 1, types: PersistencePostgres.typeParsers }),
    ),
  ),
);
const persistence = PersistencePostgres.layer.pipe(Layer.provideMerge(postgres));

it.live("migrates repeatedly, preserves the winning insert, and survives reconnection", () =>
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
        ["First proposal", "Second proposal"],
        (title) =>
          Effect.gen(function* () {
            const store = yield* HumanTaskStore.Service;
            return yield* Effect.result(
              store.create(
                PendingHumanTask.make({
                  ...task,
                  subject: { title: HumanTaskTitle.make(title) },
                }),
              ),
            );
          }).pipe(Effect.provide(persistence)),
        { concurrency: "unbounded" },
      );
      assert.lengthOf(inserted.filter(Result.isSuccess), 1);
      const failures = inserted.filter(Result.isFailure);
      assert.lengthOf(failures, 1);
      for (const failure of failures)
        assert.instanceOf(failure.failure, HumanTaskStore.PersistenceError);
      const completed = yield* Effect.gen(function* () {
        const store = yield* HumanTaskStore.Service;
        assert.deepStrictEqual(
          [yield* store.get(task.id)],
          inserted.filter(Result.isSuccess).map((result) => result.success),
        );
        return yield* store.complete(
          task.id,
          { decision: "approved" },
          DateTime.makeUnsafe("2026-09-28T13:00:00.456Z"),
        );
      }).pipe(Effect.provide(persistence));
      // Every provide above has closed its pool before this new connection reads the result.
      yield* Effect.gen(function* () {
        const store = yield* HumanTaskStore.Service;
        assert.deepStrictEqual(yield* store.get(task.id), completed);
        const missing = HumanTaskId.make("00000000-0000-4000-8000-000000000098");
        assert.deepStrictEqual(
          yield* Effect.flip(store.complete(missing, { decision: "approved" }, task.createdAt)),
          new HumanTaskStore.NotFound({ id: missing }),
        );
      }).pipe(Effect.provide(persistence));
    }).pipe(Effect.ensuring(cleanup.pipe(Effect.orDie)));
  }),
);

it.live("rechecks pending status after a competing transaction releases its row lock", () =>
  Effect.gen(function* () {
    const task = PendingHumanTask.make({
      id: HumanTaskId.make("00000000-0000-4000-8000-000000000097"),
      intent: "authorize",
      subject: { title: HumanTaskTitle.make("Locked proposal") },
      response: { type: "approval" },
      createdAt: DateTime.makeUnsafe(0),
      status: "pending",
    });
    const cleanup = Effect.gen(function* () {
      const sql = yield* PgClient.PgClient;
      yield* sql`DELETE FROM human_tasks WHERE id = ${task.id}`;
    }).pipe(Effect.provide(postgres));
    yield* Effect.gen(function* () {
      const database = yield* makeWithDefaults();
      yield* migrate(database, migrationConfig);
    }).pipe(Effect.provide(postgres));
    yield* cleanup;
    yield* Effect.gen(function* () {
      yield* Effect.gen(function* () {
        const store = yield* HumanTaskStore.Service;
        yield* store.create(task);
      }).pipe(Effect.provide(persistence));
      const locked = yield* Deferred.make<number>();
      const release = yield* Deferred.make<void>();
      const winner = yield* Effect.gen(function* () {
        const sql = yield* PgClient.PgClient;
        const store = yield* HumanTaskStore.Service;
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`SELECT id FROM human_tasks WHERE id = ${task.id} FOR UPDATE`;
            const rows = yield* sql`SELECT pg_backend_pid() AS pid`;
            const [backend] = yield* Schema.decodeUnknownEffect(
              Schema.Array(Schema.Struct({ pid: Schema.Int })),
            )(rows);
            assert.isDefined(backend);
            if (backend === undefined) return yield* Effect.die("Missing backend PID");
            yield* Deferred.succeed(locked, backend.pid);
            yield* Deferred.await(release);
            return yield* store.complete(
              task.id,
              { decision: "approved" },
              DateTime.makeUnsafe(1000),
            );
          }),
        );
      }).pipe(Effect.provide(persistence), Effect.forkScoped);
      const blocker = yield* Deferred.await(locked);
      // Fork outside the transaction so the contender cannot inherit its connection.
      const contender = yield* Effect.gen(function* () {
        const store = yield* HumanTaskStore.Service;
        return yield* Effect.result(
          store.complete(task.id, { decision: "rejected" }, DateTime.makeUnsafe(2000)),
        );
      }).pipe(Effect.provide(persistence), Effect.forkScoped);
      yield* Effect.gen(function* () {
        const sql = yield* PgClient.PgClient;
        // Observe an actual lock wait, rather than assuming concurrent scheduling overlaps.
        while (true) {
          const rows =
            yield* sql`SELECT pid FROM pg_stat_activity WHERE ${blocker} = ANY(pg_blocking_pids(pid))`;
          if (rows.length > 0) return;
          yield* Effect.yieldNow;
        }
      }).pipe(Effect.provide(postgres), Effect.timeout("5 seconds"));
      yield* Deferred.succeed(release, undefined);
      const completed = yield* Fiber.join(winner);
      const outcome = yield* Fiber.join(contender);
      assert.deepStrictEqual(
        outcome,
        Result.fail(new HumanTaskStore.AlreadyCompleted({ id: task.id })),
      );
      assert.deepStrictEqual(completed, {
        ...task,
        status: "completed",
        result: { decision: "approved" },
        completedAt: DateTime.makeUnsafe(1000),
      });
      yield* Effect.gen(function* () {
        const store = yield* HumanTaskStore.Service;
        assert.deepStrictEqual(yield* store.get(task.id), completed);
      }).pipe(Effect.provide(persistence));
    }).pipe(
      Effect.timeout("10 seconds"),
      Effect.scoped,
      Effect.ensuring(cleanup.pipe(Effect.orDie)),
    );
  }),
);
