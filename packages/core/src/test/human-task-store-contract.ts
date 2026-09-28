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
  yield* store.create(task);
  assert.deepStrictEqual(yield* store.get(task.id), task);
  assert.instanceOf(yield* Effect.flip(store.create(task)), HumanTaskStore.PersistenceError);
  const result = { decision: "approved", feedback: "" } as const;
  const completedAt = DateTime.makeUnsafe("2026-09-28T13:00:00.123Z");
  const completed = yield* store.complete(task.id, result, completedAt);
  assert.deepStrictEqual(completed, { ...task, status: "completed", result, completedAt });
  assert.deepStrictEqual(yield* store.get(task.id), completed);
  assert.deepStrictEqual(yield* store.list, [completed]);
  for (const decision of ["approved", "rejected"] as const) {
    assert.deepStrictEqual(
      yield* Effect.flip(store.complete(task.id, { decision }, task.createdAt)),
      new HumanTaskStore.AlreadyCompleted({ id: task.id }),
    );
  }
  assert.instanceOf(yield* Effect.flip(store.create(task)), HumanTaskStore.PersistenceError);
  assert.deepStrictEqual(yield* store.get(task.id), completed);
});

export * as HumanTaskStoreContract from "./human-task-store-contract.ts";
