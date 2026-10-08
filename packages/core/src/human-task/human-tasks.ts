import {
  type ApprovalResult,
  type CompletedHumanTask,
  type HumanTask,
  HumanTaskId,
  PendingHumanTask,
} from "@moku/domain/human-task";
import type { Membership } from "@moku/domain/organization";
import { Context, Crypto, DateTime, Effect, Layer, Schema } from "effect";
import { Access } from "../access/access.ts";
import { HumanTaskStore } from "./human-task-store.ts";

export const CreateInput = Schema.Struct({
  intent: PendingHumanTask.fields.intent,
  subject: PendingHumanTask.fields.subject,
  context: PendingHumanTask.fields.context,
  response: PendingHumanTask.fields.response,
});
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

export const allowedRoles = {
  get: ["owner", "admin", "member", "viewer"],
  list: ["owner", "admin", "member", "viewer"],
  create: ["owner", "admin", "member"],
  respond: ["owner", "admin", "member"],
} as const satisfies Record<"get" | "list" | "create" | "respond", Access.AllowedRoles>;

/** Operations act inside the membership's organization; callers resolve the membership. */
export interface Interface {
  readonly create: (
    membership: Membership,
    input: CreateInput,
  ) => Effect.Effect<
    PendingHumanTask,
    Access.Denied | HumanTaskStore.PersistenceError | IdGenerationError
  >;
  readonly respond: (
    membership: Membership,
    taskId: HumanTaskId,
    result: ApprovalResult,
  ) => Effect.Effect<
    CompletedHumanTask,
    | Access.Denied
    | HumanTaskStore.PersistenceError
    | HumanTaskStore.NotFound
    | HumanTaskStore.AlreadyCompleted
  >;
  readonly get: (
    membership: Membership,
    taskId: HumanTaskId,
  ) => Effect.Effect<
    HumanTask,
    Access.Denied | HumanTaskStore.PersistenceError | HumanTaskStore.NotFound
  >;
  readonly list: (
    membership: Membership,
  ) => Effect.Effect<ReadonlyArray<HumanTask>, Access.Denied | HumanTaskStore.PersistenceError>;
}

export class Service extends Context.Service<Service, Interface>()("@moku/core/HumanTasks") {}

export class IdGenerationError extends Schema.TaggedError<IdGenerationError>()(
  "HumanTasks.IdGenerationError",
  { cause: Schema.Defect() },
) {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const store = yield* HumanTaskStore.Service;
    const crypto = yield* Crypto.Crypto;

    const create = Effect.fn("HumanTasks.create")(function* (
      membership: Membership,
      { subject, ...input }: CreateInput,
    ) {
      yield* Access.requireRole(allowedRoles.create, membership.role);

      const id = yield* crypto.randomUUIDv4.pipe(
        Effect.flatMap(Schema.decodeEffect(HumanTaskId)),
        Effect.mapError((cause) => new IdGenerationError({ cause })),
      );
      const createdAt = yield* DateTime.now;
      return yield* store.create(
        PendingHumanTask.make({
          ...input,
          subject,
          id,
          organizationId: membership.organizationId,
          createdAt,
          status: "pending",
        }),
      );
    });

    const respond = Effect.fn("HumanTasks.respond")(function* (
      membership: Membership,
      taskId: HumanTaskId,
      result: ApprovalResult,
    ) {
      yield* Access.requireRole(allowedRoles.respond, membership.role);

      const completedAt = yield* DateTime.now;
      return yield* store.complete(
        { organizationId: membership.organizationId, taskId },
        result,
        completedAt,
        { userId: membership.userId, role: membership.role },
      );
    });

    const get = Effect.fn("HumanTasks.get")(function* (
      membership: Membership,
      taskId: HumanTaskId,
    ) {
      yield* Access.requireRole(allowedRoles.get, membership.role);

      return yield* store.get({ organizationId: membership.organizationId, taskId });
    });

    const list = Effect.fn("HumanTasks.list")(function* (membership: Membership) {
      yield* Access.requireRole(allowedRoles.list, membership.role);

      return yield* store.list(membership.organizationId);
    });

    return Service.of({ create, respond, get, list });
  }),
);

export * as HumanTasks from "./human-tasks.ts";
