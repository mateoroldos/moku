import { HumanTask, HumanTaskId } from "@moku/domain/human-task";
import { Context, Crypto, DateTime, Effect, Layer, Schema } from "effect";
import { HumanTaskStore } from "./human-task-store.ts";

export const CreateInput = Schema.Struct({
  title: HumanTask.fields.title,
  description: HumanTask.fields.description,
});
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

export interface Interface {
  readonly create: (
    input: CreateInput,
  ) => Effect.Effect<HumanTask, IdGenerationError | HumanTaskStore.PersistenceError>;
  readonly get: (
    id: HumanTaskId,
  ) => Effect.Effect<HumanTask, HumanTaskStore.NotFound | HumanTaskStore.PersistenceError>;
  readonly list: Effect.Effect<ReadonlyArray<HumanTask>, HumanTaskStore.PersistenceError>;
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
    const crypto = yield* Crypto.Crypto;

    const create = Effect.fn("HumanTaskDirectory.create")(function* ({
      title,
      ...details
    }: CreateInput) {
      const id = yield* crypto.randomUUIDv4.pipe(
        Effect.flatMap(Schema.decodeEffect(HumanTaskId)),
        Effect.mapError((cause) => new IdGenerationError({ cause })),
      );
      const createdAt = yield* DateTime.now;
      return yield* store.create(
        HumanTask.make({ ...details, title, id, createdAt, status: "pending" }),
      );
    });
    const get = Effect.fn("HumanTaskDirectory.get")(function* (id: HumanTaskId) {
      return yield* store.get(id);
    });

    return Service.of({ create, get, list: store.list });
  }),
);

export * as HumanTaskDirectory from "./human-task-directory.ts";
