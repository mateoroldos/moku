import { assert, it } from "@effect/vitest";
import { HumanTaskStore } from "@moku/core/human-task-store";
import { HumanTaskStoreContract } from "@moku/core/test/human-task-store-contract";
import { HumanTaskId, HumanTaskTitle, PendingHumanTask } from "@moku/domain/human-task";
import { eq } from "drizzle-orm";
import { DateTime, Effect, Result } from "effect";
import { Database } from "../internal/database.ts";
import { PersistencePglite } from "../test/persistence-pglite.ts";
import { humanTasks } from "./schema.ts";

const task = PendingHumanTask.make({
  id: HumanTaskId.make("00000000-0000-4000-8000-000000000001"),
  intent: "authorize",
  subject: { title: HumanTaskTitle.make("Publish report"), description: "Line one\nLine two" },
  context: "",
  response: { type: "approval" },
  createdAt: DateTime.makeUnsafe("2026-09-28T12:34:56.789Z"),
  status: "pending",
});

it.effect(
  "round-trips requests and completion without overwriting either",
  () => HumanTaskStoreContract.lifecycle.pipe(Effect.provide(PersistencePglite.layer)),
  { timeout: 15000 },
);

it.effect(
  "isolates reads and completion by task ID",
  () => HumanTaskStoreContract.isolation.pipe(Effect.provide(PersistencePglite.layer)),
  { timeout: 15000 },
);

it.effect(
  "omits absent optional fields when decoding stored tasks",
  () =>
    Effect.gen(function* () {
      const store = yield* HumanTaskStore.Service;
      const { context: _, ...minimal } = task;
      yield* store.create(minimal);
      assert.deepStrictEqual(yield* store.get(task.id), minimal);
      const completed = yield* store.complete(task.id, { decision: "rejected" }, task.createdAt);
      assert.notProperty(completed, "context");
      assert.notProperty(completed.result, "feedback");
    }).pipe(Effect.provide(PersistencePglite.layer)),
  { timeout: 15000 },
);

it.effect(
  "rejects corrupt stored requests and enforces lifecycle constraints",
  () =>
    Effect.gen(function* () {
      const store = yield* HumanTaskStore.Service;
      const database = yield* Database.Service;
      yield* store.create(task);
      const invalidState = yield* Effect.result(
        database.update(humanTasks).set({ status: "completed" }).where(eq(humanTasks.id, task.id)),
      );
      assert.isTrue(Result.isFailure(invalidState));
      assert.deepStrictEqual(yield* store.get(task.id), task);
      yield* database
        .update(humanTasks)
        .set({ subject: { title: " " } })
        .where(eq(humanTasks.id, task.id));
      const failure = yield* Effect.flip(store.get(task.id));
      assert.instanceOf(failure, HumanTaskStore.PersistenceError);
      assert.instanceOf(yield* Effect.flip(store.list), HumanTaskStore.PersistenceError);
    }).pipe(Effect.provide(PersistencePglite.layer)),
  { timeout: 15000 },
);
