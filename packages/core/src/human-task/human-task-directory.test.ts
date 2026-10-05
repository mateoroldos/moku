import { assert, it } from "@effect/vitest";
import { HumanTaskId, HumanTaskTitle, PendingHumanTask } from "@moku/domain/human-task";
import { UserId } from "@moku/domain/identity";
import { OrganizationId, type OrganizationRole } from "@moku/domain/organization";
import { DateTime, Effect, Layer, Option, PlatformError } from "effect";
import { TestClock } from "effect/testing";
import { OrganizationMembershipStore } from "../access/organization-membership-store.ts";
import { Transaction } from "../transaction/transaction.ts";
import { CryptoDeterministic } from "../test/crypto-deterministic.ts";
import { HumanTaskDirectory } from "./human-task-directory.ts";
import { HumanTaskStore } from "./human-task-store.ts";
import { HumanTaskStoreMemory } from "./human-task-store-memory.ts";

const organizationId = OrganizationId.make("organization");
const principal = { userId: UserId.make("reviewer"), emailVerified: true };
const ref = { organizationId, taskId: HumanTaskId.make("00000000-0000-4000-8000-000000000009") };
const input = HumanTaskDirectory.CreateInput.make({
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
const member = (role: OrganizationRole) =>
  Option.some(
    OrganizationMembershipStore.Member.make({ userId: principal.userId, organizationId, role }),
  );
const unavailable = new OrganizationMembershipStore.Unavailable({ cause: "offline" });

// Policy tests deliberately do not simulate database transactions; PostgreSQL owns that proof.
const transaction = Layer.succeed(Transaction.Service, { run: (effect) => effect });
const memberships = (lookup: ReturnType<OrganizationMembershipStore.Interface["find"]>) =>
  Layer.succeed(OrganizationMembershipStore.Service, {
    find: () => lookup,
    findForWrite: () => lookup,
    list: () => Effect.succeed([]),
  });
const dependencies = (lookup: ReturnType<OrganizationMembershipStore.Interface["find"]>) =>
  Layer.mergeAll(
    HumanTaskStoreMemory.layer,
    CryptoDeterministic.layer,
    transaction,
    memberships(lookup),
  );
const testLayer = HumanTaskDirectory.layer.pipe(
  Layer.provideMerge(dependencies(Effect.succeed(member("member")))),
);

it.effect("creates distinct pending tasks with server-owned IDs, times, and request data", () =>
  Effect.gen(function* () {
    const directory = yield* HumanTaskDirectory.Service;
    yield* TestClock.setTime(1_000);
    const first = yield* directory.create(principal, organizationId, input);
    yield* TestClock.setTime(2_000);
    const second = yield* directory.create(principal, organizationId, input);
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
      const directory = yield* HumanTaskDirectory.Service;
      yield* store.create(pending);
      assert.deepStrictEqual(yield* directory.get(principal, ref), pending);
      assert.deepStrictEqual(yield* directory.list(principal, organizationId), [pending]);
    }).pipe(
      Effect.provide(
        HumanTaskDirectory.layer.pipe(
          Layer.provideMerge(dependencies(Effect.succeed(member(role)))),
        ),
      ),
    ),
);

it.effect.each(["owner", "admin", "member"] as const)(
  "allows %s to create and records its checked role and server time when answering",
  (role) =>
    Effect.gen(function* () {
      const directory = yield* HumanTaskDirectory.Service;
      const task = yield* directory.create(principal, organizationId, input);
      const result = { decision: "approved", feedback: "Reviewed" } as const;
      yield* TestClock.setTime(2_000);
      const completed = yield* directory.respond(
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
        HumanTaskDirectory.layer.pipe(
          Layer.provideMerge(dependencies(Effect.succeed(member(role)))),
        ),
      ),
    ),
);

const denied = [
  {
    name: "unverified",
    actor: { ...principal, emailVerified: false },
    lookup: Effect.succeed(member("owner")),
    tag: "Access.Unverified",
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
    const directory = yield* HumanTaskDirectory.Service;
    yield* store.create(pending);
    assert.strictEqual((yield* Effect.flip(directory.get(actor, ref)))._tag, tag);
    assert.strictEqual((yield* Effect.flip(directory.list(actor, organizationId)))._tag, tag);
  }).pipe(Effect.provide(HumanTaskDirectory.layer.pipe(Layer.provideMerge(dependencies(lookup))))),
);

it.effect.each([
  ...denied,
  {
    name: "viewer",
    actor: principal,
    lookup: Effect.succeed(member("viewer")),
    tag: "Access.Denied",
  },
])("denies creates and answers on $name without changing tasks", ({ actor, lookup, tag }) =>
  Effect.gen(function* () {
    const store = yield* HumanTaskStore.Service;
    const directory = yield* HumanTaskDirectory.Service;
    yield* store.create(pending);
    assert.strictEqual(
      (yield* Effect.flip(directory.create(actor, organizationId, input)))._tag,
      tag,
    );
    assert.strictEqual(
      (yield* Effect.flip(directory.respond(actor, ref, { decision: "approved" })))._tag,
      tag,
    );
    assert.deepStrictEqual(yield* store.list(organizationId), [pending]);
  }).pipe(Effect.provide(HumanTaskDirectory.layer.pipe(Layer.provideMerge(dependencies(lookup))))),
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
    const directory = yield* HumanTaskDirectory.Service;
    assert.strictEqual(
      yield* Effect.flip(directory.create(principal, organizationId, input)),
      failure,
    );
    assert.strictEqual(
      yield* Effect.flip(directory.respond(principal, ref, { decision: "approved" })),
      failure,
    );
    assert.strictEqual(yield* Effect.flip(directory.get(principal, ref)), failure);
    assert.strictEqual(yield* Effect.flip(directory.list(principal, organizationId)), failure);
  }).pipe(
    Effect.provide(
      HumanTaskDirectory.layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            store,
            CryptoDeterministic.layer,
            transaction,
            memberships(Effect.succeed(member("member"))),
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
    const directory = yield* HumanTaskDirectory.Service;
    const store = yield* HumanTaskStore.Service;
    assert.instanceOf(
      yield* Effect.flip(directory.create(principal, organizationId, input)),
      HumanTaskDirectory.IdGenerationError,
    );
    assert.deepStrictEqual(yield* store.list(organizationId), []);
  }).pipe(
    Effect.provide(
      HumanTaskDirectory.layer.pipe(
        Layer.provideMerge(
          Layer.mergeAll(
            HumanTaskStoreMemory.layer,
            CryptoDeterministic.randomUUIDLayer(uuid),
            transaction,
            memberships(Effect.succeed(member("member"))),
          ),
        ),
      ),
    ),
  ),
);
