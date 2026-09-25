import { assert, it } from "@effect/vitest";
import { HumanTask, HumanTaskId, HumanTaskTitle } from "@moku/domain/human-task";
import { DateTime, Effect, Result } from "effect";
import { HumanTaskStore } from "./human-task-store.ts";
import { HumanTaskStoreMemory } from "./human-task-store-memory.ts";

it.effect("shares persisted tasks within a build and isolates separate builds", () =>
  Effect.gen(function* () {
    yield* Effect.gen(function* () {
      const store = yield* HumanTaskStore.Service;
      const task = HumanTask.make({
        id: HumanTaskId.make("00000000-0000-4000-8000-000000000001"),
        title: HumanTaskTitle.make("Review"),
        createdAt: yield* DateTime.now,
        status: "pending",
      });
      yield* store.create(task);
      assert.deepStrictEqual(yield* store.get(task.id), task);
      assert.deepStrictEqual(yield* store.list, [task]);
    }).pipe(Effect.provide(HumanTaskStoreMemory.layer));

    yield* Effect.gen(function* () {
      const store = yield* HumanTaskStore.Service;
      assert.deepStrictEqual(yield* store.list, []);
    }).pipe(Effect.provide(HumanTaskStoreMemory.layer));
  }),
);

it.effect("allows exactly one competing insert per ID and preserves the winner", () =>
  Effect.gen(function* () {
    const store = yield* HumanTaskStore.Service;
    const id = HumanTaskId.make("00000000-0000-4000-8000-000000000001");
    const createdAt = yield* DateTime.now;
    const candidates = ["First proposal", "Second proposal"].map((title) =>
      HumanTask.make({ id, title: HumanTaskTitle.make(title), createdAt, status: "pending" }),
    );
    const results = yield* Effect.forEach(candidates, (task) => Effect.result(store.create(task)), {
      concurrency: "unbounded",
    });
    const winners = results.filter(Result.isSuccess).map((result) => result.success);
    const failures = results.filter(Result.isFailure).map((result) => result.failure);
    assert.lengthOf(winners, 1);
    assert.lengthOf(failures, 1);
    for (const failure of failures) assert.instanceOf(failure, HumanTaskStore.PersistenceError);
    assert.deepStrictEqual(yield* store.list, winners);
    assert.deepStrictEqual([yield* store.get(id)], winners);
  }).pipe(Effect.provide(HumanTaskStoreMemory.layer)),
);
