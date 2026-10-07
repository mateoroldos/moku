import { assert, it } from "@effect/vitest";
import { HumanTaskId, HumanTaskTitle, PendingHumanTask } from "@moku/domain/human-task";
import { UserId } from "@moku/domain/identity";
import { OrganizationId, type OrganizationRole } from "@moku/domain/organization";
import { DateTime, Effect, Layer, Option, PlatformError } from "effect";
import { TestClock } from "effect/testing";
import { OrganizationMembershipStore } from "../organization/organization-membership-store.ts";
import { Transaction } from "../transaction/transaction.ts";
import { CryptoDeterministic } from "../test/crypto-deterministic.ts";
import { HumanTasks } from "./human-tasks.ts";
import { HumanTaskStore } from "./human-task-store.ts";
import { HumanTaskStoreMemory } from "./human-task-store-memory.ts";

const organizationId = OrganizationId.make("organization");
const principal = { userId: UserId.make("reviewer"), emailVerified: true };
const ref = { organizationId, taskId: HumanTaskId.make("00000000-0000-4000-8000-000000000009") };
const input = HumanTasks.CreateInput.make({
  intent: "authorize",
  subject: { title: HumanTaskTitle.make("Publish the report"), description: "Weekly summary" },
  context: "Send the reviewed report to leadership.",
  response: { type: "approval" },
});
const pending = PendingHumanTask.make({
  ...input,
  id: ref.taskId,
  organizationId,
  status: "pending",
  createdAt: DateTime.makeUnsafe(0),
});
const membership = (role: OrganizationRole) =>
  Option.some(
    OrganizationMembershipStore.Membership.make({ userId: principal.userId, organizationId, role }),
  );
const unavailable = new OrganizationMembershipStore.Unavailable({ cause: "offline" });

// Policy tests deliberately do not simulate database transactions; PostgreSQL owns that proof.
const transaction = Layer.succeed(Transaction.Service, {
  run: (effect) => effect.pipe(Effect.provideService(Transaction.Active, {})),
});
const memberships = (lookup: ReturnType<OrganizationMembershipStore.Interface["find"]>) =>
  Layer.succeed(OrganizationMembershipStore.Service, {
    find: () => lookup,
    findForWrite: () => lookup,
    listOrganizationsForUser: () => Effect.succeed([]),
    listMembers: () => Effect.succeed([]),
  });
const dependencies = (lookup: ReturnType<OrganizationMembershipStore.Interface["find"]>) =>
  Layer.mergeAll(
    HumanTaskStoreMemory.layer,
    CryptoDeterministic.layer,
    transaction,
    memberships(lookup),
  );
const testLayer = HumanTasks.layer.pipe(
  Layer.provideMerge(dependencies(Effect.succeed(membership("member")))),
);

it.effect("creates distinct pending tasks with server-owned IDs, times, and request data", () =>
  Effect.gen(function* () {
    const humanTasks = yield* HumanTasks.Service;
    yield* TestClock.setTime(1_000);
    const first = yield* humanTasks.create(principal, organizationId, input);
    yield* TestClock.setTime(2_000);
    const second = yield* humanTasks.create(principal, organizationId, input);
    assert.deepStrictEqual(first, {
      ...input,
      organizationId,
      id: HumanTaskId.make("00000000-0000-4000-8000-000000000001"),
      status: "pending",
      createdAt: DateTime.makeUnsafe(1_000),
    });
    assert.strictEqual(second.id, "00000000-0000-4000-8000-000000000002");
    assert.strictEqual(DateTime.toEpochMillis(second.createdAt), 2_000);
  }).pipe(Effect.provide(testLayer)),
);

it.effect.each(["owner", "admin", "member", "viewer"] as const)(
  "allows %s to read organization tasks",
  (role) =>
    Effect.gen(function* () {
      const store = yield* HumanTaskStore.Service;
      const humanTasks = yield* HumanTasks.Service;
      yield* store.create(pending);
      assert.deepStrictEqual(yield* humanTasks.get(principal, ref), pending);
      assert.deepStrictEqual(yield* humanTasks.list(principal, organizationId), [pending]);
    }).pipe(
      Effect.provide(
        HumanTasks.layer.pipe(Layer.provideMerge(dependencies(Effect.succeed(membership(role))))),
      ),
    ),
);

it.effect.each(["owner", "admin", "member"] as const)(
  "allows %s to create and records its checked role and server time when answering",
  (role) =>
    Effect.gen(function* () {
      const humanTasks = yield* HumanTasks.Service;
      const task = yield* humanTasks.create(principal, organizationId, input);
      const result = { decision: "approved", feedback: "Reviewed" } as const;
      yield* TestClock.setTime(2_000);
      const completed = yield* humanTasks.respond(
        principal,
        { organizationId, taskId: task.id },
        result,
      );
      const { status: _, ...request } = task;
      assert.deepStrictEqual(completed, {
        ...request,
        status: "completed",
        result,
        completedAt: DateTime.makeUnsafe(2_000),
        attribution: { userId: UserId.make("reviewer"), role },
      });
    }).pipe(
      Effect.provide(
        HumanTasks.layer.pipe(Layer.provideMerge(dependencies(Effect.succeed(membership(role))))),
      ),
    ),
);

const denied = [
  {
    name: "unverified",
    actor: { ...principal, emailVerified: false },
    lookup: Effect.succeed(membership("owner")),
    tag: "Access.UnverifiedEmail",
  },
  {
    name: "non-member",
    actor: principal,
    lookup: Effect.succeed(Option.none()),
    tag: "Access.NotFound",
  },
  {
    name: "membership outage",
    actor: principal,
    lookup: Effect.fail(unavailable),
    tag: "OrganizationMembershipStore.Unavailable",
  },
];

it.effect.each(denied)("denies reads on $name", ({ actor, lookup, tag }) =>
  Effect.gen(function* () {
    const store = yield* HumanTaskStore.Service;
    const humanTasks = yield* HumanTasks.Service;
    yield* store.create(pending);
    assert.strictEqual((yield* Effect.flip(humanTasks.get(actor, ref)))._tag, tag);
    assert.strictEqual((yield* Effect.flip(humanTasks.list(actor, organizationId)))._tag, tag);
  }).pipe(Effect.provide(HumanTasks.layer.pipe(Layer.provideMerge(dependencies(lookup))))),
);

it.effect.each([
  ...denied,
  {
    name: "viewer",
    actor: principal,
    lookup: Effect.succeed(membership("viewer")),
    tag: "Access.Denied",
  },
])("denies creates and answers on $name without changing tasks", ({ actor, lookup, tag }) =>
  Effect.gen(function* () {
    const store = yield* HumanTaskStore.Service;
    const humanTasks = yield* HumanTasks.Service;
    yield* store.create(pending);
    assert.strictEqual(
      (yield* Effect.flip(humanTasks.create(actor, organizationId, input)))._tag,
      tag,
    );
    assert.strictEqual(
      (yield* Effect.flip(humanTasks.respond(actor, ref, { decision: "approved" })))._tag,
      tag,
    );
    assert.deepStrictEqual(yield* store.list(organizationId), [pending]);
  }).pipe(Effect.provide(HumanTasks.layer.pipe(Layer.provideMerge(dependencies(lookup))))),
);

it.effect("preserves storage failures rather than reporting a successful operation", () => {
  const failure = new HumanTaskStore.PersistenceError({ cause: new Error("Storage unavailable") });
  const store = Layer.succeed(HumanTaskStore.Service, {
    create: () => Effect.fail(failure),
    complete: () => Effect.fail(failure),
    get: () => Effect.fail(failure),
    list: () => Effect.fail(failure),
  });
  return Effect.gen(function* () {
    const humanTasks = yield* HumanTasks.Service;
    assert.strictEqual(
      yield* Effect.flip(humanTasks.create(principal, organizationId, input)),
      failure,
    );
    assert.strictEqual(
      yield* Effect.flip(humanTasks.respond(principal, ref, { decision: "approved" })),
      failure,
    );
    assert.strictEqual(yield* Effect.flip(humanTasks.get(principal, ref)), failure);
    assert.strictEqual(yield* Effect.flip(humanTasks.list(principal, organizationId)), failure);
  }).pipe(
    Effect.provide(
      HumanTasks.layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            store,
            CryptoDeterministic.layer,
            transaction,
            memberships(Effect.succeed(membership("member"))),
          ),
        ),
      ),
    ),
  );
});

const cryptoError = PlatformError.badArgument({
  module: "Crypto",
  method: "randomUUIDv4",
  description: "Randomness unavailable",
});
it.effect.each([
  { label: "unavailable randomness", uuid: Effect.fail(cryptoError) },
  { label: "invalid generated ID", uuid: Effect.succeed("invalid") },
])("fails without storing a task on $label", ({ uuid }) =>
  Effect.gen(function* () {
    const humanTasks = yield* HumanTasks.Service;
    const store = yield* HumanTaskStore.Service;
    assert.instanceOf(
      yield* Effect.flip(humanTasks.create(principal, organizationId, input)),
      HumanTasks.IdGenerationError,
    );
    assert.deepStrictEqual(yield* store.list(organizationId), []);
  }).pipe(
    Effect.provide(
      HumanTasks.layer.pipe(
        Layer.provideMerge(
          Layer.mergeAll(
            HumanTaskStoreMemory.layer,
            CryptoDeterministic.randomUUIDLayer(uuid),
            transaction,
            memberships(Effect.succeed(membership("member"))),
          ),
        ),
      ),
    ),
  ),
);
