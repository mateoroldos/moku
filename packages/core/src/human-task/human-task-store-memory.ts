import type { HumanTask, HumanTaskId } from "@moku/domain/human-task";
import { Effect, Layer, Ref } from "effect";
import { HumanTaskStore } from "./human-task-store.ts";

/** Test persistence with atomic insert-only writes and fresh state per layer build. */
export const layer = Layer.effect(
  HumanTaskStore.Service,
  Effect.gen(function* () {
    const state = yield* Ref.make(new Map<HumanTaskId, HumanTask>());
    return HumanTaskStore.Service.of({
      create: (task) =>
        Ref.modify(
          state,
          (
            tasks,
          ): readonly [
            Effect.Effect<HumanTask, HumanTaskStore.PersistenceError>,
            Map<HumanTaskId, HumanTask>,
          ] =>
            tasks.has(task.id)
              ? [
                  Effect.fail(new HumanTaskStore.PersistenceError({ cause: "Duplicate task ID" })),
                  tasks,
                ]
              : [Effect.succeed(task), new Map(tasks).set(task.id, task)],
        ).pipe(Effect.flatten),
      get: (id) =>
        Ref.get(state).pipe(
          Effect.flatMap((tasks) => {
            const task = tasks.get(id);
            return task === undefined
              ? Effect.fail(new HumanTaskStore.NotFound({ id }))
              : Effect.succeed(task);
          }),
        ),
      list: Ref.get(state).pipe(Effect.map((tasks) => [...tasks.values()])),
    });
  }),
);

export * as HumanTaskStoreMemory from "./human-task-store-memory.ts";
