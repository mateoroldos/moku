import { assert, it } from "@effect/vitest";
import { HumanTaskId, HumanTaskTitle, PendingHumanTask } from "@moku/domain/human-task";
import { UserId } from "@moku/domain/identity";
import { Membership, OrganizationId, type OrganizationRole } from "@moku/domain/organization";
import { DateTime, Effect, Layer, PlatformError } from "effect";
import { TestClock } from "effect/testing";
import { CryptoDeterministic } from "../test/crypto-deterministic.ts";
import { HumanTasks } from "./human-tasks.ts";
import { HumanTaskStore } from "./human-task-store.ts";
import { HumanTaskStoreMemory } from "./human-task-store-memory.ts";

const organizationId = OrganizationId.make("organization");
const taskId = HumanTaskId.make("00000000-0000-4000-8000-000000000009");
const input = HumanTasks.CreateInput.make({
  intent: "authorize",
  subject: { title: HumanTaskTitle.make("Publish the report"), description: "Weekly summary" },
  context: "Send the reviewed report to leadership.",
  response: { type: "approval" },
});
const pending = PendingHumanTask.make({
  ...input,
  id: taskId,
  organizationId,
  status: "pending",
  createdAt: DateTime.makeUnsafe(0),
});
const membership = (role: OrganizationRole, organization = organizationId) =>
  Membership.make({ userId: UserId.make("reviewer"), organizationId: organization, role });
const member = membership("member");

const testLayer = HumanTasks.layer.pipe(
  Layer.provideMerge(Layer.merge(HumanTaskStoreMemory.layer, CryptoDeterministic.layer)),
);

it.effect("creates distinct pending tasks with server-owned IDs, times, and request data", () =>
  Effect.gen(function* () {
    const humanTasks = yield* HumanTasks.Service;
    yield* TestClock.setTime(1_000);
    const first = yield* humanTasks.create(member, input);
    yield* TestClock.setTime(2_000);
    const second = yield* humanTasks.create(member, input);
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
      assert.deepStrictEqual(yield* humanTasks.get(membership(role), taskId), pending);
      assert.deepStrictEqual(yield* humanTasks.list(membership(role)), [pending]);
    }).pipe(Effect.provide(testLayer)),
);

it.effect.each(["owner", "admin", "member"] as const)(
  "allows %s to create and records its checked role and server time when answering",
  (role) =>
    Effect.gen(function* () {
      const humanTasks = yield* HumanTasks.Service;
      const task = yield* humanTasks.create(membership(role), input);
      const result = { decision: "approved", feedback: "Reviewed" } as const;
      yield* TestClock.setTime(2_000);
      const completed = yield* humanTasks.respond(membership(role), task.id, result);
      const { status: _, ...request } = task;
      assert.deepStrictEqual(completed, {
        ...request,
        status: "completed",
        result,
        completedAt: DateTime.makeUnsafe(2_000),
        attribution: { userId: UserId.make("reviewer"), role },
      });
    }).pipe(Effect.provide(testLayer)),
);

it.effect("denies viewer creates and answers without changing tasks", () =>
  Effect.gen(function* () {
    const store = yield* HumanTaskStore.Service;
    const humanTasks = yield* HumanTasks.Service;
    const viewer = membership("viewer");
    yield* store.create(pending);
    assert.strictEqual(
      (yield* Effect.flip(humanTasks.create(viewer, input)))._tag,
      "Access.Denied",
    );
    assert.strictEqual(
      (yield* Effect.flip(humanTasks.respond(viewer, taskId, { decision: "approved" })))._tag,
      "Access.Denied",
    );
    assert.deepStrictEqual(yield* store.list(organizationId), [pending]);
  }).pipe(Effect.provide(testLayer)),
);

it.effect("scopes every operation to the membership's organization", () =>
  Effect.gen(function* () {
    const store = yield* HumanTaskStore.Service;
    const humanTasks = yield* HumanTasks.Service;
    const outsider = membership("owner", OrganizationId.make("other"));
    yield* store.create(pending);
    assert.strictEqual(
      (yield* Effect.flip(humanTasks.get(outsider, taskId)))._tag,
      "HumanTaskStore.NotFound",
    );
    assert.strictEqual(
      (yield* Effect.flip(humanTasks.respond(outsider, taskId, { decision: "approved" })))._tag,
      "HumanTaskStore.NotFound",
    );
    assert.deepStrictEqual(yield* humanTasks.list(outsider), []);
    assert.strictEqual((yield* humanTasks.create(outsider, input)).organizationId, "other");
    assert.deepStrictEqual(yield* store.list(organizationId), [pending]);
  }).pipe(Effect.provide(testLayer)),
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
    assert.strictEqual(yield* Effect.flip(humanTasks.create(member, input)), failure);
    assert.strictEqual(
      yield* Effect.flip(humanTasks.respond(member, taskId, { decision: "approved" })),
      failure,
    );
    assert.strictEqual(yield* Effect.flip(humanTasks.get(member, taskId)), failure);
    assert.strictEqual(yield* Effect.flip(humanTasks.list(member)), failure);
  }).pipe(
    Effect.provide(
      HumanTasks.layer.pipe(Layer.provide(Layer.merge(store, CryptoDeterministic.layer))),
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
      yield* Effect.flip(humanTasks.create(member, input)),
      HumanTasks.IdGenerationError,
    );
    assert.deepStrictEqual(yield* store.list(organizationId), []);
  }).pipe(
    Effect.provide(
      HumanTasks.layer.pipe(
        Layer.provideMerge(
          Layer.merge(HumanTaskStoreMemory.layer, CryptoDeterministic.randomUUIDLayer(uuid)),
        ),
      ),
    ),
  ),
);
