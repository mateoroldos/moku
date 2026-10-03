import {
  type ApprovalResult,
  type CompletedHumanTask,
  type HumanTask,
  HumanTaskId,
  PendingHumanTask,
  type TaskRef,
} from "@moku/domain/human-task";
import type { Principal } from "@moku/domain/identity";
import type { OrganizationId, OrganizationRole } from "@moku/domain/organization";
import { Context, Crypto, DateTime, Effect, Layer, Schema } from "effect";
import { OrganizationAccess } from "../access/organization-access.ts";
import { Transaction } from "../transaction/transaction.ts";
import { HumanTaskStore } from "./human-task-store.ts";

export const CreateInput = Schema.Struct({
  intent: PendingHumanTask.fields.intent,
  subject: PendingHumanTask.fields.subject,
  context: PendingHumanTask.fields.context,
  response: PendingHumanTask.fields.response,
});
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

export const permissions = {
  get: ["owner", "admin", "member", "viewer"],
  list: ["owner", "admin", "member", "viewer"],
  create: ["owner", "admin", "member"],
  respond: ["owner", "admin", "member"],
} as const satisfies Record<"get" | "list" | "create" | "respond", ReadonlyArray<OrganizationRole>>;

type ReadFailure = OrganizationAccess.Failure | HumanTaskStore.PersistenceError;
type WriteFailure = ReadFailure | Transaction.Unavailable;

export interface Interface {
  readonly create: (
    principal: Principal,
    organizationId: OrganizationId,
    input: CreateInput,
  ) => Effect.Effect<PendingHumanTask, WriteFailure | IdGenerationError>;
  readonly respond: (
    principal: Principal,
    ref: TaskRef,
    result: ApprovalResult,
  ) => Effect.Effect<
    CompletedHumanTask,
    WriteFailure | HumanTaskStore.NotFound | HumanTaskStore.AlreadyCompleted
  >;
  readonly get: (
    principal: Principal,
    ref: TaskRef,
  ) => Effect.Effect<HumanTask, ReadFailure | HumanTaskStore.NotFound>;
  readonly list: (
    principal: Principal,
    organizationId: OrganizationId,
  ) => Effect.Effect<ReadonlyArray<HumanTask>, ReadFailure>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@moku/core/HumanTaskDirectory",
) {}
export class IdGenerationError extends Schema.TaggedError<IdGenerationError>()(
  "HumanTaskDirectory.IdGenerationError",
  { cause: Schema.Defect() },
) {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const store = yield* HumanTaskStore.Service;
    const access = yield* OrganizationAccess.Service;
    const transaction = yield* Transaction.Service;
    const crypto = yield* Crypto.Crypto;

    const create = Effect.fn("HumanTaskDirectory.create")(function* (
      principal: Principal,
      organizationId: OrganizationId,
      { subject, ...input }: CreateInput,
    ) {
      return yield* transaction.run(
        Effect.gen(function* () {
          yield* access.requireForWrite(principal, organizationId, permissions.create);
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
    const respond = Effect.fn("HumanTaskDirectory.respond")(function* (
      principal: Principal,
      ref: TaskRef,
      result: ApprovalResult,
    ) {
      return yield* transaction.run(
        Effect.gen(function* () {
          const member = yield* access.requireForWrite(
            principal,
            ref.organizationId,
            permissions.respond,
          );
          const completedAt = yield* DateTime.now;
          return yield* store.complete(ref, result, completedAt, {
            userId: member.userId,
            role: member.role,
          });
        }),
      );
    });
    const get = Effect.fn("HumanTaskDirectory.get")(function* (principal: Principal, ref: TaskRef) {
      yield* access.require(principal, ref.organizationId, permissions.get);
      return yield* store.get(ref);
    });
    const list = Effect.fn("HumanTaskDirectory.list")(function* (
      principal: Principal,
      organizationId: OrganizationId,
    ) {
      yield* access.require(principal, organizationId, permissions.list);
      return yield* store.list(organizationId);
    });
    return Service.of({ create, respond, get, list });
  }),
).pipe(Layer.provide(OrganizationAccess.layer));

export * as HumanTaskDirectory from "./human-task-directory.ts";
