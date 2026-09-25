import { HumanTask, HumanTaskId } from "@moku/domain/human-task";
import { Context, Effect, Schema } from "effect";

export interface Interface {
  /** Insert only: duplicate IDs fail with PersistenceError and never overwrite a task. */
  readonly create: (task: HumanTask) => Effect.Effect<HumanTask, PersistenceError>;
  readonly get: (id: HumanTaskId) => Effect.Effect<HumanTask, NotFound | PersistenceError>;
  /** Returns all tasks; ordering is unspecified. */
  readonly list: Effect.Effect<ReadonlyArray<HumanTask>, PersistenceError>;
}

export class Service extends Context.Service<Service, Interface>()("@moku/core/HumanTaskStore") {}

export class NotFound extends Schema.TaggedError<NotFound>()("HumanTaskStore.NotFound", {
  id: HumanTaskId,
}) {}

export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "HumanTaskStore.PersistenceError",
  { cause: Schema.Defect() },
) {}

export * as HumanTaskStore from "./human-task-store.ts";
