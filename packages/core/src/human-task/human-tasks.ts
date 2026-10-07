import {
  type ApprovalResult,
  type CompletedHumanTask,
  type HumanTask,
  HumanTaskId,
  PendingHumanTask,
  type TaskRef,
} from "@moku/domain/human-task";
import type { Principal } from "@moku/domain/identity";
import type { OrganizationId } from "@moku/domain/organization";
import { Context, Crypto, DateTime, Effect, Layer, Schema } from "effect";
import type { Access } from "../access/access.ts";
import { OrganizationAccess } from "../organization/organization-access.ts";
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

export interface Interface {
  readonly create: (
    principal: Principal,
    organizationId: OrganizationId,
    input: CreateInput,
  ) => Effect.Effect<
    PendingHumanTask,
    OrganizationAccess.Failure | HumanTaskStore.PersistenceError | IdGenerationError
  >;
  readonly respond: (
    principal: Principal,
    ref: TaskRef,
    result: ApprovalResult,
  ) => Effect.Effect<
    CompletedHumanTask,
    | OrganizationAccess.Failure
    | HumanTaskStore.PersistenceError
    | HumanTaskStore.NotFound
    | HumanTaskStore.AlreadyCompleted
  >;
  readonly get: (
    principal: Principal,
    ref: TaskRef,
  ) => Effect.Effect<
    HumanTask,
    OrganizationAccess.Failure | HumanTaskStore.PersistenceError | HumanTaskStore.NotFound
  >;
  readonly list: (
    principal: Principal,
    organizationId: OrganizationId,
  ) => Effect.Effect<
    ReadonlyArray<HumanTask>,
    OrganizationAccess.Failure | HumanTaskStore.PersistenceError
  >;
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
    const access = yield* OrganizationAccess.Service;
    const crypto = yield* Crypto.Crypto;

    const create = Effect.fn("HumanTasks.create")(function* (
      principal: Principal,
      organizationId: OrganizationId,
      { subject, ...input }: CreateInput,
    ) {
      return yield* access.withWriteAccess(principal, organizationId, allowedRoles.create, () =>
        Effect.gen(function* () {
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
              organizationId,
              createdAt,
              status: "pending",
            }),
          );
        }),
      );
    });

    const respond = Effect.fn("HumanTasks.respond")(function* (
      principal: Principal,
      ref: TaskRef,
      result: ApprovalResult,
    ) {
      return yield* access.withWriteAccess(
        principal,
        ref.organizationId,
        allowedRoles.respond,
        (membership) =>
          Effect.gen(function* () {
            const completedAt = yield* DateTime.now;

            return yield* store.complete(ref, result, completedAt, {
              userId: membership.userId,
              role: membership.role,
            });
          }),
      );
    });

    const get = Effect.fn("HumanTasks.get")(function* (principal: Principal, ref: TaskRef) {
      yield* access.require(principal, ref.organizationId, allowedRoles.get);

      return yield* store.get(ref);
    });

    const list = Effect.fn("HumanTasks.list")(function* (
      principal: Principal,
      organizationId: OrganizationId,
    ) {
      yield* access.require(principal, organizationId, allowedRoles.list);

      return yield* store.list(organizationId);
    });

    return Service.of({ create, respond, get, list });
  }),
).pipe(Layer.provide(OrganizationAccess.layer));

export * as HumanTasks from "./human-tasks.ts";
