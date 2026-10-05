import { PgClient } from "@effect/sql-pg";
import { assert, it } from "@effect/vitest";
import { HumanTaskStore } from "@moku/core/human-task-store";
import { HumanTaskId, HumanTaskTitle, PendingHumanTask } from "@moku/domain/human-task";
import { makeWithDefaults } from "drizzle-orm/effect-postgres";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import { Config, DateTime, Deferred, Effect, Fiber, Layer, Result, Schema } from "effect";
import { migrationConfig } from "../migrations.ts";
import { PersistencePostgres } from "../persistence-postgres.ts";
import { HumanTaskStoreContract } from "@moku/core/test/human-task-store-contract";
import { UserId } from "@moku/domain/identity";

const { organizationId, ref, attribution } = HumanTaskStoreContract;
const seedOrganization = PgClient.PgClient.use(
  (sql) =>
    sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('test-org', 'Test', 'test', now()) ON CONFLICT DO NOTHING`,
);

const postgres = Layer.unwrap(
  Config.redacted("TEST_DATABASE_URL").pipe(
    Effect.map((url) =>
      PgClient.layer({ url, maxConnections: 1, types: PersistencePostgres.typeParsers }),
    ),
  ),
);
const persistence = PersistencePostgres.layer.pipe(Layer.provideMerge(postgres));

it.live(
  "auth migrations reject duplicate identities and memberships and orphan credentials and sessions",
  () =>
    Effect.gen(function* () {
      const database = yield* makeWithDefaults();
      yield* migrate(database, migrationConfig);
      const sql = yield* PgClient.PgClient;
      const cleanup = Effect.gen(function* () {
        yield* sql`DELETE FROM organization WHERE id = 'auth-schema-org'`;
        yield* sql`DELETE FROM session WHERE id IN ('auth-schema-session', 'auth-schema-duplicate', 'auth-orphan')`;
        yield* sql`DELETE FROM account WHERE id = 'auth-orphan'`;
        yield* sql`DELETE FROM "user" WHERE id IN ('auth-schema-test', 'auth-schema-duplicate')`;
      });
      yield* cleanup;
      yield* Effect.gen(function* () {
        yield* sql`INSERT INTO "user" (id, name, email)
        VALUES ('auth-schema-test', 'Schema test', 'schema-test@example.test')`;
        yield* sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('auth-schema-org', 'Schema test', 'auth-schema-org', now())`;
        yield* sql`INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ('auth-schema-member', 'auth-schema-org', 'auth-schema-test', 'member', now())`;
        const duplicateMember = yield* Effect.flip(
          sql`INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ('auth-schema-member-duplicate', 'auth-schema-org', 'auth-schema-test', 'owner', now())`,
        );
        assert.strictEqual(duplicateMember.reason._tag, "UniqueViolation");
        assert.propertyVal(
          duplicateMember.reason.cause,
          "constraint",
          "member_organizationId_userId_uidx",
        );
        const duplicate = yield* Effect.flip(sql`INSERT INTO "user" (id, name, email)
        VALUES ('auth-schema-duplicate', 'Duplicate', 'schema-test@example.test')`);
        assert.strictEqual(duplicate.reason._tag, "UniqueViolation");
        assert.propertyVal(duplicate.reason.cause, "constraint", "user_email_key");
        const orphanAccount = yield* Effect.flip(sql`INSERT INTO account
        (id, account_id, provider_id, user_id, updated_at)
        VALUES ('auth-orphan', 'auth-missing-user', 'credential', 'auth-missing-user', now())`);
        assert.propertyVal(orphanAccount.reason.cause, "code", "23503");
        assert.propertyVal(
          orphanAccount.reason.cause,
          "constraint",
          "account_user_id_user_id_fkey",
        );
        const orphanSession = yield* Effect.flip(sql`INSERT INTO session
        (id, token, user_id, expires_at, updated_at)
        VALUES ('auth-orphan', 'auth-orphan-token', 'auth-missing-user', now(), now())`);
        assert.propertyVal(orphanSession.reason.cause, "code", "23503");
        assert.propertyVal(
          orphanSession.reason.cause,
          "constraint",
          "session_user_id_user_id_fkey",
        );
        yield* sql`INSERT INTO session (id, token, user_id, expires_at, updated_at)
        VALUES ('auth-schema-session', 'auth-schema-token', 'auth-schema-test', now(), now())`;
        const duplicateToken = yield* Effect.flip(sql`INSERT INTO session
        (id, token, user_id, expires_at, updated_at)
        VALUES ('auth-schema-duplicate', 'auth-schema-token', 'auth-schema-test', now(), now())`);
        assert.strictEqual(duplicateToken.reason._tag, "UniqueViolation");
        assert.propertyVal(duplicateToken.reason.cause, "constraint", "session_token_key");
      }).pipe(Effect.ensuring(cleanup.pipe(Effect.orDie)));
    }).pipe(Effect.provide(postgres)),
);

it.live("migrates repeatedly, preserves the winning insert, and survives reconnection", () =>
  Effect.gen(function* () {
    yield* Effect.gen(function* () {
      const database = yield* makeWithDefaults();
      yield* migrate(database, migrationConfig);
      yield* migrate(database, migrationConfig);
      yield* seedOrganization;
    }).pipe(Effect.provide(postgres));

    const task = PendingHumanTask.make({
      organizationId,
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
        const pending = yield* store.get(ref(task.id));
        assert.deepStrictEqual(
          [pending],
          inserted.filter(Result.isSuccess).map((result) => result.success),
        );
        const result = { decision: "approved" } as const;
        const completedAt = DateTime.makeUnsafe("2026-09-28T13:00:00.456Z");
        const saved = yield* store.complete(ref(task.id), result, completedAt, attribution);
        assert.deepStrictEqual(saved, {
          ...pending,
          status: "completed",
          result,
          completedAt,
          attribution,
        });
        return saved;
      }).pipe(Effect.provide(persistence));
      // Every provide above has closed its pool before this new connection reads the result.
      yield* Effect.gen(function* () {
        const store = yield* HumanTaskStore.Service;
        assert.deepStrictEqual(yield* store.get(ref(task.id)), completed);
        const missing = HumanTaskId.make("00000000-0000-4000-8000-000000000098");
        assert.deepStrictEqual(
          yield* Effect.flip(
            store.complete(ref(missing), { decision: "approved" }, task.createdAt, attribution),
          ),
          new HumanTaskStore.NotFound(ref(missing)),
        );
      }).pipe(Effect.provide(persistence));
    }).pipe(Effect.ensuring(cleanup.pipe(Effect.orDie)));
  }),
);

it.live("rechecks pending status after a competing transaction releases its row lock", () =>
  Effect.gen(function* () {
    const winnerAttribution = { userId: UserId.make("winning-reviewer"), role: "member" } as const;
    const loserAttribution = { userId: UserId.make("losing-reviewer"), role: "admin" } as const;
    const task = PendingHumanTask.make({
      organizationId,
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
      yield* seedOrganization;
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
              ref(task.id),
              { decision: "approved" },
              DateTime.makeUnsafe(1000),
              winnerAttribution,
            );
          }),
        );
      }).pipe(Effect.provide(persistence), Effect.forkScoped);
      const blocker = yield* Deferred.await(locked);
      // Fork outside the transaction so the contender cannot inherit its connection.
      const contender = yield* Effect.gen(function* () {
        const store = yield* HumanTaskStore.Service;
        return yield* Effect.result(
          store.complete(
            ref(task.id),
            { decision: "rejected" },
            DateTime.makeUnsafe(2000),
            loserAttribution,
          ),
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
        Result.fail(new HumanTaskStore.AlreadyCompleted(ref(task.id))),
      );
      assert.deepStrictEqual(completed, {
        ...task,
        status: "completed",
        result: { decision: "approved" },
        completedAt: DateTime.makeUnsafe(1000),
        attribution: winnerAttribution,
      });
      yield* Effect.gen(function* () {
        const store = yield* HumanTaskStore.Service;
        assert.deepStrictEqual(yield* store.get(ref(task.id)), completed);
      }).pipe(Effect.provide(persistence));
    }).pipe(
      Effect.timeout("10 seconds"),
      Effect.scoped,
      Effect.ensuring(cleanup.pipe(Effect.orDie)),
    );
  }),
);
