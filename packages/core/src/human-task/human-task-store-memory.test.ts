import { assert, it } from "@effect/vitest";
import { PendingHumanTask, HumanTaskId, HumanTaskTitle } from "@moku/domain/human-task";
import { DateTime, Effect, Result } from "effect";
import { HumanTaskStore } from "./human-task-store.ts";
import { HumanTaskStoreMemory } from "./human-task-store-memory.ts";
import { HumanTaskStoreContract } from "../test/human-task-store-contract.ts";

it.effect("honors the shared store lifecycle contract", () =>
  HumanTaskStoreContract.lifecycle.pipe(Effect.provide(HumanTaskStoreMemory.layer)),
);

it.effect("isolates reads and completion by task ID", () =>
  HumanTaskStoreContract.isolation.pipe(Effect.provide(HumanTaskStoreMemory.layer)),
);

it.effect("shares persisted tasks within a build and isolates separate builds", () =>
  Effect.gen(function* () {
    yield* Effect.gen(function* () {
      const store = yield* HumanTaskStore.Service;
      const task = PendingHumanTask.make({
        id: HumanTaskId.make("00000000-0000-4000-8000-000000000001"),
        intent: "authorize",
        subject: { title: HumanTaskTitle.make("Review") },
        response: { type: "approval" },
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

it.effect("atomically completes once under competing responses and preserves request data", () =>
  Effect.gen(function* () {
    const store = yield* HumanTaskStore.Service;
    const task = PendingHumanTask.make({
      id: HumanTaskId.make("00000000-0000-4000-8000-000000000001"),
      intent: "authorize",
      subject: { title: HumanTaskTitle.make("Publish"), description: "The final report" },
      context: "Leadership review",
      response: { type: "approval" },
      createdAt: DateTime.makeUnsafe(1_000),
      status: "pending",
    });
    yield* store.create(task);
    const candidates = [
      {
        result: { decision: "approved", feedback: "Ready" },
        completedAt: DateTime.makeUnsafe(2_000),
      },
      {
        result: { decision: "rejected", feedback: "Revise" },
        completedAt: DateTime.makeUnsafe(3_000),
      },
    ] as const;
    const outcomes = yield* Effect.forEach(
      candidates,
      ({ result, completedAt }) => Effect.result(store.complete(task.id, result, completedAt)),
      { concurrency: "unbounded" },
    );
    const winners = outcomes.filter(Result.isSuccess).map((outcome) => outcome.success);
    const failures = outcomes.filter(Result.isFailure).map((outcome) => outcome.failure);
    assert.lengthOf(winners, 1);
    assert.deepStrictEqual(failures, [new HumanTaskStore.AlreadyCompleted({ id: task.id })]);
    for (const winner of winners) {
      assert.deepStrictEqual(winner, {
        ...task,
        status: "completed",
        result: winner.result,
        completedAt: winner.completedAt,
      });
      assert.isTrue(
        candidates.some(
          (candidate) =>
            candidate.result.decision === winner.result.decision &&
            candidate.result.feedback === winner.result.feedback &&
            DateTime.toEpochMillis(candidate.completedAt) ===
              DateTime.toEpochMillis(winner.completedAt),
        ),
      );
    }
    assert.deepStrictEqual([yield* store.get(task.id)], winners);
    assert.deepStrictEqual(yield* store.list, winners);
  }).pipe(Effect.provide(HumanTaskStoreMemory.layer)),
);

it.effect("allows exactly one competing insert per ID and preserves the winner", () =>
  Effect.gen(function* () {
    const store = yield* HumanTaskStore.Service;
    const id = HumanTaskId.make("00000000-0000-4000-8000-000000000001");
    const createdAt = yield* DateTime.now;
    const candidates = ["First proposal", "Second proposal"].map((title) =>
      PendingHumanTask.make({
        id,
        intent: "authorize",
        subject: { title: HumanTaskTitle.make(title) },
        response: { type: "approval" },
        createdAt,
        status: "pending",
      }),
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
