import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { PgClient } from "@effect/sql-pg";
import { assert, it } from "@effect/vitest";
import { HumanTaskDirectory } from "@moku/core/human-task-directory";
import { HumanTaskStore } from "@moku/core/human-task-store";
import { OrganizationMembershipStore } from "@moku/core/organization-membership-store";
import { Transaction } from "@moku/core/transaction";
import { HumanTaskTitle } from "@moku/domain/human-task";
import { UserId } from "@moku/domain/identity";
import { OrganizationId } from "@moku/domain/organization";
import { makeWithDefaults } from "drizzle-orm/effect-postgres";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import { Cause, Config, Deferred, Effect, Exit, Fiber, Layer, Option, Schema } from "effect";
import { migrationConfig } from "../migrations.ts";
import { PersistencePostgres } from "../persistence-postgres.ts";

const postgres = Layer.unwrap(
  Config.redacted("TEST_DATABASE_URL").pipe(
    Effect.map((url) =>
      PgClient.layer({ url, maxConnections: 5, types: PersistencePostgres.typeParsers }),
    ),
  ),
);
const application = HumanTaskDirectory.layer.pipe(
  Layer.provideMerge(PersistencePostgres.layer),
  Layer.provide(NodeCrypto.layer),
  Layer.provideMerge(postgres),
);

const actor = { userId: UserId.make("tenant-user"), emailVerified: true };
const organizationId = OrganizationId.make("tenant-org");
const input = HumanTaskDirectory.CreateInput.make({
  intent: "authorize",
  subject: { title: HumanTaskTitle.make("Tenant review") },
  response: { type: "approval" },
});

const cleanup = PgClient.PgClient.use((sql) =>
  Effect.gen(function* () {
    yield* sql`DELETE FROM human_tasks WHERE organization_id = 'tenant-org'`;
    yield* sql`DELETE FROM organization WHERE id = 'tenant-org'`;
    yield* sql`DELETE FROM "user" WHERE id = 'tenant-user'`;
  }),
);

const fixture = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const database = yield* makeWithDefaults();
    yield* migrate(database, migrationConfig);
    const sql = yield* PgClient.PgClient;
    yield* cleanup;
    return yield* Effect.gen(function* () {
      yield* sql`INSERT INTO "user" (id, name, email, email_verified) VALUES ('tenant-user', 'Tenant', 'tenant@example.test', true)`;
      yield* sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('tenant-org', 'Tenant', 'tenant', now())`;
      yield* sql`INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ('tenant-member', 'tenant-org', 'tenant-user', 'member', now())`;
      return yield* program.pipe(Effect.timeout("10 seconds"), Effect.scoped);
    }).pipe(Effect.ensuring(cleanup.pipe(Effect.orDie)));
  }).pipe(Effect.provide(application));

const backendPid = PgClient.PgClient.use((sql) =>
  sql`SELECT pg_backend_pid() AS pid`.pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(Schema.NonEmptyArray(Schema.Struct({ pid: Schema.Int }))),
    ),
    Effect.map((rows) => rows[0].pid),
  ),
);

const waitForBlocker = (pid: number) =>
  PgClient.PgClient.use((sql) =>
    Effect.gen(function* () {
      while (true) {
        const rows =
          yield* sql`SELECT pid FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))`;
        if (rows.length > 0) return;
        yield* Effect.yieldNow;
      }
    }),
  ).pipe(Effect.timeout("5 seconds"));

it.live("rolls back completion and attribution across the production core ports", () =>
  fixture(
    Effect.gen(function* () {
      const directory = yield* HumanTaskDirectory.Service;
      const transaction = yield* Transaction.Service;
      const pending = yield* directory.create(actor, organizationId, input);
      const ref = { organizationId, taskId: pending.id };
      const failure = yield* Effect.flip(
        transaction.run(
          Effect.gen(function* () {
            yield* directory.respond(actor, ref, { decision: "approved" });
            return yield* Effect.fail("rollback");
          }),
        ),
      );
      assert.strictEqual(failure, "rollback");
      assert.deepStrictEqual(yield* directory.get(actor, ref), pending);
    }),
  ),
);

it.live("rejects malformed persisted roles without confusing absence", () =>
  fixture(
    Effect.gen(function* () {
      const memberships = yield* OrganizationMembershipStore.Service;
      const sql = yield* PgClient.PgClient;
      yield* sql`UPDATE member SET role = 'owner,member' WHERE id = 'tenant-member'`;
      assert.instanceOf(
        yield* Effect.flip(memberships.find(actor.userId, organizationId)),
        OrganizationMembershipStore.Unavailable,
      );
      yield* sql`DELETE FROM member WHERE id = 'tenant-member'`;
      assert.deepStrictEqual(yield* memberships.find(actor.userId, organizationId), Option.none());
    }),
  ),
);

it.live("refuses a locked membership lookup without an active transaction", () =>
  fixture(
    Effect.gen(function* () {
      const memberships = yield* OrganizationMembershipStore.Service;
      const exit = yield* Effect.exit(memberships.findForWrite(actor.userId, organizationId));
      assert.isTrue(Exit.isFailure(exit));
      if (Exit.isSuccess(exit)) return assert.fail("Expected transaction prerequisite defect");
      assert.deepStrictEqual(
        Cause.squash(exit.cause),
        new Error("OrganizationMembershipStore.findForWrite requires Transaction.run"),
      );
    }),
  ),
);

// Row locks treat demotion and removal alike; core tests own the resulting failure tags.
const races = [
  { operation: "answer", status: "completed" },
  { operation: "create", status: "pending" },
] as const;

it.live.each(races)(
  "holds membership until $operation commits before removal",
  ({ operation, status }) =>
    fixture(
      Effect.gen(function* () {
        const directory = yield* HumanTaskDirectory.Service;
        const store = yield* HumanTaskStore.Service;
        const sql = yield* PgClient.PgClient;

        const pending = yield* directory.create(actor, organizationId, input);
        const ref = { organizationId, taskId: pending.id };
        const locked = yield* Deferred.make<number>();
        const release = yield* Deferred.make<void>();
        // Pause at the existing store boundary after the directory's own access check.
        const pause = Effect.gen(function* () {
          yield* Deferred.succeed(locked, yield* backendPid);
          yield* Deferred.await(release);
        }).pipe(Effect.provideService(PgClient.PgClient, sql), Effect.orDie);
        const pausedStore = Layer.succeed(HumanTaskStore.Service, {
          ...store,
          create: (task) => pause.pipe(Effect.andThen(store.create(task))),
          complete: (...args) => pause.pipe(Effect.andThen(store.complete(...args))),
        });

        const answer = yield* Effect.gen(function* () {
          const directory = yield* HumanTaskDirectory.Service;
          return yield* operation === "answer"
            ? directory.respond(actor, ref, { decision: "approved" })
            : directory.create(actor, organizationId, input);
        }).pipe(
          Effect.provide(
            HumanTaskDirectory.layer.pipe(
              Layer.provide(Layer.merge(pausedStore, NodeCrypto.layer)),
              Layer.fresh,
            ),
          ),
          Effect.forkScoped,
        );
        const pid = yield* Effect.raceFirst(
          Deferred.await(locked),
          Fiber.join(answer).pipe(
            Effect.flatMap(() => Effect.die(new Error("Mutation bypassed the paused store"))),
          ),
        );
        const revoked = yield* sql`DELETE FROM member WHERE id = 'tenant-member'`.pipe(
          Effect.forkScoped,
        );
        yield* waitForBlocker(pid);
        yield* Deferred.succeed(release, undefined);
        const completed = yield* Fiber.join(answer);
        yield* Fiber.join(revoked);

        assert.strictEqual(completed.status, status);
        assert.strictEqual(completed.organizationId, organizationId);
        assert.deepStrictEqual(
          yield* store.get({ organizationId, taskId: completed.id }),
          completed,
        );
        const failure = yield* Effect.flip(directory.respond(actor, ref, { decision: "rejected" }));
        assert.strictEqual(failure._tag, "Access.NotFound");
      }),
    ).pipe(Effect.scoped),
);

it.live.each(races)("waits for concurrent removal and refuses $operation", ({ operation }) =>
  fixture(
    Effect.gen(function* () {
      const directory = yield* HumanTaskDirectory.Service;
      const store = yield* HumanTaskStore.Service;
      const sql = yield* PgClient.PgClient;

      const pending = yield* directory.create(actor, organizationId, input);
      const ref = { organizationId, taskId: pending.id };
      const locked = yield* Deferred.make<number>();
      const release = yield* Deferred.make<void>();

      const mutation = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM member WHERE id = 'tenant-member'`;
            yield* Deferred.succeed(locked, yield* backendPid);
            yield* Deferred.await(release);
          }),
        )
        .pipe(Effect.forkScoped);
      const pid = yield* Deferred.await(locked);
      const answer = yield* Effect.gen(function* () {
        if (operation === "answer") yield* directory.respond(actor, ref, { decision: "approved" });
        else yield* directory.create(actor, organizationId, input);
      }).pipe(Effect.flip, Effect.forkScoped);
      yield* waitForBlocker(pid);
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(mutation);

      assert.strictEqual((yield* Fiber.join(answer))._tag, "Access.NotFound");
      assert.deepStrictEqual(yield* store.get(ref), pending);
      assert.deepStrictEqual(yield* store.list(organizationId), [pending]);
    }),
  ).pipe(Effect.scoped),
);
