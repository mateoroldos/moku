import { assert } from "@effect/vitest";
import { HumanTaskId, HumanTaskTitle, PendingHumanTask } from "@moku/domain/human-task";
import { DateTime, Effect } from "effect";
import { HumanTaskStore } from "../human-task/human-task-store.ts";

/** Run against an isolated store to keep adapter implementations on the same lifecycle contract. */
export const lifecycle = Effect.gen(function* () {
  const store = yield* HumanTaskStore.Service;
  const task = PendingHumanTask.make({
    id: HumanTaskId.make("00000000-0000-4000-8000-000000000001"),
    intent: "authorize",
    subject: { title: HumanTaskTitle.make("Publish report"), description: "Line one\nLine two" },
    context: "",
    response: { type: "approval" },
    createdAt: DateTime.makeUnsafe("2026-09-28T12:34:56.789Z"),
    status: "pending",
  });
  assert.deepStrictEqual(yield* store.list, []);
  assert.deepStrictEqual(yield* store.create(task), task);
  assert.deepStrictEqual(yield* store.get(task.id), task);
  const replacement = PendingHumanTask.make({
    ...task,
    subject: { title: HumanTaskTitle.make("Different proposal") },
    context: "Must not replace the original",
  });
  assert.instanceOf(yield* Effect.flip(store.create(replacement)), HumanTaskStore.PersistenceError);
  assert.deepStrictEqual(yield* store.get(task.id), task);
  const result = { decision: "approved", feedback: "" } as const;
  const completedAt = DateTime.makeUnsafe("2026-09-28T13:00:00.123Z");
  const completed = yield* store.complete(task.id, result, completedAt);
  assert.deepStrictEqual(completed, { ...task, status: "completed", result, completedAt });
  assert.deepStrictEqual(yield* store.get(task.id), completed);
  assert.deepStrictEqual(yield* store.list, [completed]);
  for (const retry of [result, { decision: "rejected" }] as const) {
    assert.deepStrictEqual(
      yield* Effect.flip(store.complete(task.id, retry, completedAt)),
      new HumanTaskStore.AlreadyCompleted({ id: task.id }),
    );
  }
  assert.instanceOf(yield* Effect.flip(store.create(task)), HumanTaskStore.PersistenceError);
  assert.deepStrictEqual(yield* store.get(task.id), completed);
});

export const isolation = Effect.gen(function* () {
  const store = yield* HumanTaskStore.Service;
  const first = PendingHumanTask.make({
    id: HumanTaskId.make("00000000-0000-4000-8000-000000000001"),
    intent: "authorize",
    subject: { title: HumanTaskTitle.make("First proposal") },
    response: { type: "approval" },
    createdAt: DateTime.makeUnsafe(0),
    status: "pending",
  });
  const sibling = PendingHumanTask.make({
    ...first,
    id: HumanTaskId.make("00000000-0000-4000-8000-000000000002"),
    subject: { title: HumanTaskTitle.make("Sibling proposal") },
  });
  const missing = HumanTaskId.make("00000000-0000-4000-8000-000000000003");
  yield* store.create(first);
  yield* store.create(sibling);
  assert.deepStrictEqual(yield* store.get(first.id), first);
  assert.deepStrictEqual(yield* store.get(sibling.id), sibling);
  assert.deepStrictEqual(
    yield* Effect.flip(store.get(missing)),
    new HumanTaskStore.NotFound({ id: missing }),
  );
  assert.deepStrictEqual(
    yield* Effect.flip(store.complete(missing, { decision: "approved" }, first.createdAt)),
    new HumanTaskStore.NotFound({ id: missing }),
  );
  assert.sameDeepMembers([...(yield* store.list)], [first, sibling]);
  const completed = yield* store.complete(first.id, { decision: "rejected" }, first.createdAt);
  assert.deepStrictEqual(yield* store.get(first.id), completed);
  assert.deepStrictEqual(yield* store.get(sibling.id), sibling);
  assert.sameDeepMembers([...(yield* store.list)], [completed, sibling]);
});

export * as HumanTaskStoreContract from "./human-task-store-contract.ts";
