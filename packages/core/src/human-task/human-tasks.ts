import {
  type ApprovalResult,
  type CompletedHumanTask,
  type HumanTask,
  HumanTaskId,
  PendingHumanTask,
} from "@moku/domain/human-task";
import type { Membership, OrganizationKey } from "@moku/domain/organization";
import { Context, Crypto, DateTime, Effect, Layer, Predicate, Schema } from "effect";
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
  respond: ["owner", "admin", "member"],
} as const satisfies Record<"get" | "list" | "respond", Access.AllowedRoles>;

/** A member acts by role; an organization key alone creates tasks and may read them, never answer or list. */
export type Caller = Membership | OrganizationKey;

const authorize = (allowedRoles: Access.AllowedRoles, caller: Caller) =>
  Predicate.isTagged(caller, "OrganizationKey")
    ? Effect.void
    : Access.requireRole(allowedRoles, caller.role);

/** Operations act inside the caller's organization; entrypoints resolve the caller. */
export interface Interface {
  readonly create: (
    key: OrganizationKey,
    input: CreateInput,
  ) => Effect.Effect<PendingHumanTask, HumanTaskStore.PersistenceError | IdGenerationError>;
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
    caller: Caller,
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
      key: OrganizationKey,
      { subject, ...input }: CreateInput,
    ) {
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
          organizationId: key.organizationId,
          requester: { id: key.id, name: key.name },
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

    const get = Effect.fn("HumanTasks.get")(function* (caller: Caller, taskId: HumanTaskId) {
      yield* authorize(allowedRoles.get, caller);

      return yield* store.get({ organizationId: caller.organizationId, taskId });
    });

    const list = Effect.fn("HumanTasks.list")(function* (membership: Membership) {
      yield* Access.requireRole(allowedRoles.list, membership.role);

      return yield* store.list(membership.organizationId);
    });

    return Service.of({ create, respond, get, list });
  }),
);

export * as HumanTasks from "./human-tasks.ts";
