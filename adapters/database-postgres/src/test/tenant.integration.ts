import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { PgClient } from "@effect/sql-pg";
import { assert, it } from "@effect/vitest";
import { HumanTasks } from "@moku/core/human-tasks";
import { HumanTaskStore } from "@moku/core/human-task-store";
import { OrganizationMembershipStore } from "@moku/core/organization-membership-store";
import { OrganizationAccess } from "@moku/core/organization-access";
import { HumanTaskTitle } from "@moku/domain/human-task";
import { UserId } from "@moku/domain/identity";
import { OrganizationId } from "@moku/domain/organization";
import { makeWithDefaults } from "drizzle-orm/effect-postgres";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import {
  Cause,
  Config,
  DateTime,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Schema,
} from "effect";
import { migrationConfig } from "../migrations.ts";
import { PersistencePostgres } from "../persistence-postgres.ts";

const postgres = Layer.unwrap(
  Config.redacted("TEST_DATABASE_URL").pipe(
    Effect.map((url) =>
      PgClient.layer({ url, maxConnections: 5, types: PersistencePostgres.typeParsers }),
    ),
  ),
);
const application = Layer.merge(HumanTasks.layer, OrganizationAccess.layer).pipe(
  Layer.provideMerge(PersistencePostgres.layer),
  Layer.provide(NodeCrypto.layer),
  Layer.provideMerge(postgres),
);

const actor = { userId: UserId.make("tenant-user"), emailVerified: true };
const organizationId = OrganizationId.make("tenant-org");
const input = HumanTasks.CreateInput.make({
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
      const humanTasks = yield* HumanTasks.Service;
      const access = yield* OrganizationAccess.Service;
      const store = yield* HumanTaskStore.Service;
      const pending = yield* humanTasks.create(actor, organizationId, input);
      const ref = { organizationId, taskId: pending.id };
      const rejected = { reason: "rollback" };

      const failure = yield* Effect.flip(
        access.withWriteAccess(
          actor,
          organizationId,
          HumanTasks.allowedRoles.respond,
          (membership) =>
            Effect.gen(function* () {
              yield* store.complete(ref, { decision: "approved" }, yield* DateTime.now, {
                userId: membership.userId,
                role: membership.role,
              });

              return yield* Effect.fail(rejected);
            }),
        ),
      );

      assert.strictEqual(failure, rejected);
      assert.deepStrictEqual(yield* humanTasks.get(actor, ref), pending);
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
      assert.instanceOf(
        yield* Effect.flip(
          memberships.withLock(actor.userId, organizationId, () =>
            Effect.die("Malformed membership reached the callback"),
          ),
        ),
        OrganizationMembershipStore.Unavailable,
      );

      yield* sql`DELETE FROM member WHERE id = 'tenant-member'`;
      assert.deepStrictEqual(yield* memberships.find(actor.userId, organizationId), Option.none());
      assert.deepStrictEqual(
        yield* memberships.withLock(actor.userId, organizationId, Effect.succeed),
        Option.none(),
      );
    }),
  ),
);

it.live("rolls back interrupted writes and releases the membership lock", () =>
  fixture(
    Effect.gen(function* () {
      const humanTasks = yield* HumanTasks.Service;
      const access = yield* OrganizationAccess.Service;
      const store = yield* HumanTaskStore.Service;
      const sql = yield* PgClient.PgClient;
      const pending = yield* humanTasks.create(actor, organizationId, input);
      const ref = { organizationId, taskId: pending.id };
      const written = yield* Deferred.make<number>();

      const writer = yield* access
        .withWriteAccess(actor, organizationId, HumanTasks.allowedRoles.respond, (membership) =>
          Effect.gen(function* () {
            yield* store.complete(ref, { decision: "approved" }, yield* DateTime.now, {
              userId: membership.userId,
              role: membership.role,
            });
            yield* Deferred.succeed(written, yield* backendPid);

            return yield* Effect.never;
          }),
        )
        .pipe(Effect.forkScoped);
      const pid = yield* Deferred.await(written);
      const removal = yield* sql`DELETE FROM member WHERE id = 'tenant-member'`.pipe(
        Effect.forkScoped,
      );
      yield* waitForBlocker(pid);

      yield* Fiber.interrupt(writer);
      yield* Fiber.join(removal);

      const exit = yield* Fiber.await(writer);
      assert.isTrue(Exit.isFailure(exit));
      if (Exit.isSuccess(exit)) return assert.fail("Expected interrupted writer");
      assert.isTrue(Cause.hasInterruptsOnly(exit.cause));
      assert.deepStrictEqual(yield* store.get(ref), pending);
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
        const humanTasks = yield* HumanTasks.Service;
        const store = yield* HumanTaskStore.Service;
        const sql = yield* PgClient.PgClient;

        const pending = yield* humanTasks.create(actor, organizationId, input);
        const ref = { organizationId, taskId: pending.id };
        const locked = yield* Deferred.make<number>();
        const release = yield* Deferred.make<void>();
        // Pause at the existing store boundary after the operation's own access check.
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
          const humanTasks = yield* HumanTasks.Service;
          return yield* operation === "answer"
            ? humanTasks.respond(actor, ref, { decision: "approved" })
            : humanTasks.create(actor, organizationId, input);
        }).pipe(
          Effect.provide(
            HumanTasks.layer.pipe(
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
        const failure = yield* Effect.flip(
          humanTasks.respond(actor, ref, { decision: "rejected" }),
        );
        assert.strictEqual(failure._tag, "Access.NotFound");
      }),
    ).pipe(Effect.scoped),
);

it.live.each(races)("waits for concurrent removal and refuses $operation", ({ operation }) =>
  fixture(
    Effect.gen(function* () {
      const humanTasks = yield* HumanTasks.Service;
      const store = yield* HumanTaskStore.Service;
      const sql = yield* PgClient.PgClient;

      const pending = yield* humanTasks.create(actor, organizationId, input);
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
        if (operation === "answer") yield* humanTasks.respond(actor, ref, { decision: "approved" });
        else yield* humanTasks.create(actor, organizationId, input);
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
