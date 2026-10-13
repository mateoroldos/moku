import {
  type CallbackUrl,
  CompletedHumanTask,
  type HumanTask,
  type HumanTaskId,
  type PendingHumanTask,
} from "@moku/domain/human-task";
import { Array, Context, DateTime, Effect, Layer, Order, Ref } from "effect";
import { CallbackOutbox } from "./callback-outbox.ts";
import { HumanTaskStore } from "./human-task-store.ts";

const newestFirst = Order.flip(
  Order.combine(
    Order.mapInput(DateTime.Order, (task: HumanTask) => task.createdAt),
    Order.mapInput(Order.String, (task: HumanTask) => task.id),
  ),
);

interface QueuedDelivery {
  readonly delivery: CallbackOutbox.Delivery;
  readonly dueAt: DateTime.Utc;
  readonly sending: boolean;
}

interface State {
  readonly tasks: Map<HumanTaskId, HumanTask>;
  readonly callbacks: Map<HumanTaskId, CallbackUrl>;
  readonly deliveries: Map<HumanTaskId, QueuedDelivery>;
}

/** Test persistence with atomic writes and fresh state per layer build. */
export const layer = Layer.effectContext(
  Effect.gen(function* () {
    const state = yield* Ref.make<State>({
      tasks: new Map(),
      callbacks: new Map(),
      deliveries: new Map(),
    });

    const store = HumanTaskStore.Service.of({
      create: (task, callbackUrl) =>
        Ref.modify(
          state,
          (
            current,
          ): readonly [Effect.Effect<PendingHumanTask, HumanTaskStore.PersistenceError>, State] => {
            if (current.tasks.has(task.id))
              return [
                Effect.fail(new HumanTaskStore.PersistenceError({ cause: "Duplicate task ID" })),
                current,
              ];
            const callbacks = new Map(current.callbacks);
            if (callbackUrl !== undefined) callbacks.set(task.id, callbackUrl);
            return [
              Effect.succeed(task),
              { ...current, tasks: new Map(current.tasks).set(task.id, task), callbacks },
            ];
          },
        ).pipe(Effect.flatten),
      complete: (ref, result, completedAt, attribution) =>
        Ref.modify(
          state,
          (
            current,
          ): readonly [
            Effect.Effect<
              CompletedHumanTask,
              HumanTaskStore.NotFound | HumanTaskStore.AlreadyCompleted
            >,
            State,
          ] => {
            const task = current.tasks.get(ref.taskId);
            if (task === undefined || task.organizationId !== ref.organizationId)
              return [Effect.fail(new HumanTaskStore.NotFound(ref)), current];
            if (task.status === "completed")
              return [Effect.fail(new HumanTaskStore.AlreadyCompleted(ref)), current];
            const completed = CompletedHumanTask.make({
              ...task,
              status: "completed",
              result,
              completedAt,
              attribution,
            });
            const url = current.callbacks.get(ref.taskId);
            const deliveries = new Map(current.deliveries);
            if (url !== undefined)
              deliveries.set(ref.taskId, {
                delivery: { task: completed, url, attempts: 0 },
                dueAt: completedAt,
                sending: false,
              });
            return [
              Effect.succeed(completed),
              {
                ...current,
                tasks: new Map(current.tasks).set(ref.taskId, completed),
                deliveries,
              },
            ];
          },
        ).pipe(Effect.flatten),
      get: (ref) =>
        Ref.get(state).pipe(
          Effect.flatMap(({ tasks }) => {
            const task = tasks.get(ref.taskId);
            return task === undefined || task.organizationId !== ref.organizationId
              ? Effect.fail(new HumanTaskStore.NotFound(ref))
              : Effect.succeed(task);
          }),
        ),
      list: (organizationId) =>
        Ref.get(state).pipe(
          Effect.map(({ tasks }) =>
            Array.sort(
              [...tasks.values()].filter((task) => task.organizationId === organizationId),
              newestFirst,
            ),
          ),
        ),
    });

    const updateDelivery = (
      taskId: HumanTaskId,
      update: (queued: QueuedDelivery) => QueuedDelivery | undefined,
    ) =>
      Ref.update(state, (current) => {
        const queued = current.deliveries.get(taskId);
        if (queued === undefined) return current;
        const deliveries = new Map(current.deliveries);
        const next = update(queued);
        if (next === undefined) deliveries.delete(taskId);
        else deliveries.set(taskId, next);
        return { ...current, deliveries };
      });

    const outbox = CallbackOutbox.Service.of({
      deliverDue: (now, send) =>
        Ref.modify(state, (current): readonly [Array<CallbackOutbox.Delivery>, State] => {
          const due = [...current.deliveries.values()].filter(
            (queued) => !queued.sending && DateTime.isLessThanOrEqualTo(queued.dueAt, now),
          );
          const deliveries = new Map(current.deliveries);
          for (const queued of due)
            deliveries.set(queued.delivery.task.id, { ...queued, sending: true });
          return [due.map((queued) => queued.delivery), { ...current, deliveries }];
        }).pipe(
          Effect.flatMap((claimed) =>
            Effect.forEach(
              claimed,
              (delivery) =>
                send(delivery).pipe(
                  Effect.flatMap((outcome) =>
                    updateDelivery(delivery.task.id, () =>
                      CallbackOutbox.Outcome.$match(outcome, {
                        Delivered: () => undefined,
                        Abandoned: () => undefined,
                        Retry: ({ at }) => ({
                          delivery: { ...delivery, attempts: delivery.attempts + 1 },
                          dueAt: at,
                          sending: false,
                        }),
                      }),
                    ),
                  ),
                  Effect.onError(() =>
                    updateDelivery(delivery.task.id, (queued) => ({ ...queued, sending: false })),
                  ),
                ),
              { discard: true },
            ),
          ),
        ),
    });

    return Context.make(HumanTaskStore.Service, store).pipe(
      Context.add(CallbackOutbox.Service, outbox),
    );
  }),
);

export * as HumanTaskStoreMemory from "./human-task-store-memory.ts";
