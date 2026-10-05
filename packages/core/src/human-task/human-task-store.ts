import {
  type ApprovalResult,
  type CompletedHumanTask,
  type HumanTask,
  TaskRef,
  type ResponseAttribution,
  type PendingHumanTask,
} from "@moku/domain/human-task";
import type { OrganizationId } from "@moku/domain/organization";
import { Context, type DateTime, Effect, Schema } from "effect";

export interface Interface {
  /** Insert only: duplicate IDs fail with PersistenceError and never overwrite a task. */
  readonly create: (task: PendingHumanTask) => Effect.Effect<PendingHumanTask, PersistenceError>;
  /** Atomically complete a pending task, preserving its request. First response wins;
   * later attempts fail with AlreadyCompleted, including identical retries. */
  readonly complete: (
    ref: TaskRef,
    result: ApprovalResult,
    completedAt: DateTime.Utc,
    attribution: ResponseAttribution,
  ) => Effect.Effect<CompletedHumanTask, NotFound | AlreadyCompleted | PersistenceError>;
  readonly get: (ref: TaskRef) => Effect.Effect<HumanTask, NotFound | PersistenceError>;
  readonly list: (
    organizationId: OrganizationId,
  ) => Effect.Effect<ReadonlyArray<HumanTask>, PersistenceError>;
}

export class Service extends Context.Service<Service, Interface>()("@moku/core/HumanTaskStore") {}

export class NotFound extends Schema.TaggedError<NotFound>()("HumanTaskStore.NotFound", {
  ...TaskRef.fields,
}) {}

export class AlreadyCompleted extends Schema.TaggedError<AlreadyCompleted>()(
  "HumanTaskStore.AlreadyCompleted",
  TaskRef.fields,
) {}

export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "HumanTaskStore.PersistenceError",
  { cause: Schema.Defect() },
) {}

export * as HumanTaskStore from "./human-task-store.ts";
