import {
  CompletedHumanTask,
  type HumanTask,
  type HumanTaskId,
  type PendingHumanTask,
} from "@moku/domain/human-task";
import { Effect, Layer, Ref } from "effect";
import { HumanTaskStore } from "./human-task-store.ts";

/** Test persistence with atomic writes and fresh state per layer build. */
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
            Effect.Effect<PendingHumanTask, HumanTaskStore.PersistenceError>,
            Map<HumanTaskId, HumanTask>,
          ] =>
            tasks.has(task.id)
              ? [
                  Effect.fail(new HumanTaskStore.PersistenceError({ cause: "Duplicate task ID" })),
                  tasks,
                ]
              : [Effect.succeed(task), new Map(tasks).set(task.id, task)],
        ).pipe(Effect.flatten),
      complete: (ref, result, completedAt, attribution) =>
        Ref.modify(
          state,
          (
            tasks,
          ): readonly [
            Effect.Effect<
              CompletedHumanTask,
              HumanTaskStore.NotFound | HumanTaskStore.AlreadyCompleted
            >,
            Map<HumanTaskId, HumanTask>,
          ] => {
            const task = tasks.get(ref.taskId);
            if (task === undefined || task.organizationId !== ref.organizationId)
              return [Effect.fail(new HumanTaskStore.NotFound(ref)), tasks];
            if (task.status === "completed")
              return [Effect.fail(new HumanTaskStore.AlreadyCompleted(ref)), tasks];
            const completed = CompletedHumanTask.make({
              ...task,
              status: "completed",
              result,
              completedAt,
              attribution,
            });
            return [Effect.succeed(completed), new Map(tasks).set(ref.taskId, completed)];
          },
        ).pipe(Effect.flatten),
      get: (ref) =>
        Ref.get(state).pipe(
          Effect.flatMap((tasks) => {
            const task = tasks.get(ref.taskId);
            return task === undefined || task.organizationId !== ref.organizationId
              ? Effect.fail(new HumanTaskStore.NotFound(ref))
              : Effect.succeed(task);
          }),
        ),
      list: (organizationId) =>
        Ref.get(state).pipe(
          Effect.map((tasks) =>
            [...tasks.values()].filter((task) => task.organizationId === organizationId),
          ),
        ),
    });
  }),
);

export * as HumanTaskStoreMemory from "./human-task-store-memory.ts";
