import { assert } from "@effect/vitest";
import {
  CallbackUrl,
  HumanTaskId,
  HumanTaskTitle,
  PendingHumanTask,
} from "@moku/domain/human-task";
import { UserId } from "@moku/domain/identity";
import { ApiKeyId, OrganizationId } from "@moku/domain/organization";
import { DateTime, Deferred, Effect, Fiber, Ref } from "effect";
import { CallbackOutbox } from "../human-task/callback-outbox.ts";
import { HumanTaskStore } from "../human-task/human-task-store.ts";

export const organizationId = OrganizationId.make("test-org");
export const otherOrganizationId = OrganizationId.make("other-org");
export const attribution = { userId: UserId.make("test-user"), role: "member" } as const;
export const requester = { id: ApiKeyId.make("test-key"), name: "Deploy bot" } as const;
export const ref = (taskId: HumanTaskId) => ({ organizationId, taskId });

/** Run against isolated stores with test-org and other-org present. */
export const lifecycle = Effect.gen(function* () {
  const store = yield* HumanTaskStore.Service;
  const task = PendingHumanTask.make({
    id: HumanTaskId.make("00000000-0000-4000-8000-000000000001"),
    organizationId,
    intent: "authorize",
    subject: { title: HumanTaskTitle.make("Publish report"), description: "Line one\nLine two" },
    context: "",
    response: { type: "approval" },
    requester,
    createdAt: DateTime.makeUnsafe("2026-09-28T12:34:56.789Z"),
    status: "pending",
  });

  assert.deepStrictEqual(yield* store.list(organizationId), []);
  assert.deepStrictEqual(yield* store.create(task), task);
  assert.deepStrictEqual(yield* store.get(ref(task.id)), task);

  const replacement = PendingHumanTask.make({
    ...task,
    subject: { title: HumanTaskTitle.make("Different proposal") },
    context: "Must not replace the original",
  });
  assert.instanceOf(yield* Effect.flip(store.create(replacement)), HumanTaskStore.PersistenceError);

  const result = { decision: "approved", feedback: "" } as const;
  const completedAt = DateTime.makeUnsafe("2026-09-28T13:00:00.123Z");
  const completed = yield* store.complete(ref(task.id), result, completedAt, attribution);
  assert.deepStrictEqual(completed, {
    ...task,
    status: "completed",
    result,
    completedAt,
    attribution,
  });
  assert.deepStrictEqual(yield* store.list(organizationId), [completed]);

  for (const retry of [result, { decision: "rejected" }] as const) {
    assert.deepStrictEqual(
      yield* Effect.flip(
        store.complete(ref(task.id), retry, completedAt, { ...attribution, role: "admin" }),
      ),
      new HumanTaskStore.AlreadyCompleted(ref(task.id)),
    );
  }
  assert.instanceOf(yield* Effect.flip(store.create(task)), HumanTaskStore.PersistenceError);
  assert.deepStrictEqual(yield* store.get(ref(task.id)), completed);
});

export const isolation = Effect.gen(function* () {
  const store = yield* HumanTaskStore.Service;
  const first = PendingHumanTask.make({
    id: HumanTaskId.make("00000000-0000-4000-8000-000000000001"),
    organizationId,
    intent: "authorize",
    subject: { title: HumanTaskTitle.make("First proposal") },
    response: { type: "approval" },
    requester,
    createdAt: DateTime.makeUnsafe(0),
    status: "pending",
  });
  const sibling = PendingHumanTask.make({
    ...first,
    id: HumanTaskId.make("00000000-0000-4000-8000-000000000002"),
    organizationId: otherOrganizationId,
  });
  const missing = ref(HumanTaskId.make("00000000-0000-4000-8000-000000000003"));

  yield* store.create(first);
  yield* store.create(sibling);

  assert.deepStrictEqual(yield* store.get(ref(first.id)), first);
  for (const inaccessible of [missing, ref(sibling.id)]) {
    assert.deepStrictEqual(
      yield* Effect.flip(store.get(inaccessible)),
      new HumanTaskStore.NotFound(inaccessible),
    );
    assert.deepStrictEqual(
      yield* Effect.flip(
        store.complete(inaccessible, { decision: "approved" }, first.createdAt, attribution),
      ),
      new HumanTaskStore.NotFound(inaccessible),
    );
  }
  assert.deepStrictEqual(yield* store.list(organizationId), [first]);
  assert.deepStrictEqual(yield* store.list(otherOrganizationId), [sibling]);

  const completed = yield* store.complete(
    { organizationId: otherOrganizationId, taskId: sibling.id },
    { decision: "rejected" },
    first.createdAt,
    attribution,
  );
  assert.instanceOf(
    yield* Effect.flip(
      store.complete(ref(sibling.id), { decision: "approved" }, first.createdAt, attribution),
    ),
    HumanTaskStore.NotFound,
  );
  assert.deepStrictEqual(yield* store.list(otherOrganizationId), [completed]);
});

export const ordering = Effect.gen(function* () {
  const store = yield* HumanTaskStore.Service;
  const task = (id: string, createdAt: number) =>
    PendingHumanTask.make({
      id: HumanTaskId.make(`00000000-0000-4000-8000-00000000000${id}`),
      organizationId,
      intent: "authorize",
      subject: { title: HumanTaskTitle.make(`Proposal ${id}`) },
      response: { type: "approval" },
      requester,
      createdAt: DateTime.makeUnsafe(createdAt),
      status: "pending",
    });
  const oldest = task("1", 1_000);
  const newest = task("2", 3_000);
  const sameTimeLowerId = task("3", 2_000);
  const sameTimeHigherId = task("4", 2_000);

  for (const created of [sameTimeLowerId, oldest, newest, sameTimeHigherId])
    yield* store.create(created);

  assert.deepStrictEqual(yield* store.list(organizationId), [
    newest,
    sameTimeHigherId,
    sameTimeLowerId,
    oldest,
  ]);
});

const callbackTask = (id: string) =>
  PendingHumanTask.make({
    id: HumanTaskId.make(`00000000-0000-4000-8000-00000000000${id}`),
    organizationId,
    intent: "authorize",
    subject: { title: HumanTaskTitle.make(`Proposal ${id}`) },
    response: { type: "approval" },
    requester,
    createdAt: DateTime.makeUnsafe(0),
    status: "pending",
  });
const callbackUrl = CallbackUrl.make("https://agent.example/resume/secret-token");
const result = { decision: "approved" } as const;

/** Sends the deliveries due at `now`, answering each with `outcome`; returns what was sent. */
const deliverDue = (now: number, outcome: CallbackOutbox.Outcome) =>
  Effect.gen(function* () {
    const outbox = yield* CallbackOutbox.Service;
    const sent = yield* Ref.make<ReadonlyArray<CallbackOutbox.Delivery>>([]);
    yield* outbox.deliverDue(DateTime.makeUnsafe(now), (delivery) =>
      Ref.update(sent, (all) => [...all, delivery]).pipe(Effect.as(outcome)),
    );
    return yield* Ref.get(sent);
  });

/** Run against isolated stores that also provide the callback outbox. */
export const callbacks = Effect.gen(function* () {
  const store = yield* HumanTaskStore.Service;
  const withCallback = callbackTask("1");
  const withoutCallback = callbackTask("2");
  const { Delivered, Retry } = CallbackOutbox.Outcome;

  yield* store.create(withCallback, callbackUrl);
  yield* store.create(withoutCallback);
  assert.deepStrictEqual(yield* store.get(ref(withCallback.id)), withCallback);
  assert.deepStrictEqual(yield* deliverDue(10_000, Delivered()), []);

  const completed = yield* store.complete(
    ref(withCallback.id),
    result,
    DateTime.makeUnsafe(1_000),
    attribution,
  );
  yield* store.complete(ref(withoutCallback.id), result, DateTime.makeUnsafe(1_000), attribution);
  assert.deepStrictEqual(yield* store.get(ref(withCallback.id)), completed);

  const retryAt = Retry({ at: DateTime.makeUnsafe(5_000) });
  assert.deepStrictEqual(yield* deliverDue(999, retryAt), []);
  assert.deepStrictEqual(yield* deliverDue(1_000, retryAt), [
    { task: completed, url: callbackUrl, attempts: 0 },
  ]);
  assert.deepStrictEqual(yield* deliverDue(4_999, Delivered()), []);
  assert.deepStrictEqual(yield* deliverDue(5_000, Delivered()), [
    { task: completed, url: callbackUrl, attempts: 1 },
  ]);
  assert.deepStrictEqual(yield* deliverDue(10_000, Delivered()), []);
});

/** Run against isolated stores that also provide the callback outbox. */
export const deliveryClaims = Effect.gen(function* () {
  const store = yield* HumanTaskStore.Service;
  const outbox = yield* CallbackOutbox.Service;
  const task = callbackTask("1");
  const now = DateTime.makeUnsafe(1_000);
  const sending = yield* Deferred.make<void>();
  const release = yield* Deferred.make<void>();

  yield* store.create(task, callbackUrl);
  const completed = yield* store.complete(ref(task.id), result, now, attribution);

  const first = yield* outbox
    .deliverDue(now, () =>
      Deferred.succeed(sending, undefined).pipe(
        Effect.andThen(Deferred.await(release)),
        Effect.andThen(Effect.die("Receiver crashed")),
      ),
    )
    .pipe(Effect.forkChild);
  yield* Deferred.await(sending);
  assert.deepStrictEqual(yield* deliverDue(1_000, CallbackOutbox.Outcome.Delivered()), []);

  yield* Deferred.succeed(release, undefined);
  yield* Fiber.await(first);
  assert.deepStrictEqual(yield* deliverDue(1_000, CallbackOutbox.Outcome.Delivered()), [
    { task: completed, url: callbackUrl, attempts: 0 },
  ]);
});

export * as HumanTaskStoreContract from "./human-task-store-contract.ts";
