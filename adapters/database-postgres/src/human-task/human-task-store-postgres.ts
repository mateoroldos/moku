import { HumanTaskStore } from "@moku/core/human-task-store";
import {
  type ApprovalResult,
  CompletedHumanTask,
  HumanTask,
  type HumanTaskId,
  PendingHumanTask,
} from "@moku/domain/human-task";
import { and, eq } from "drizzle-orm";
import { DateTime, Effect, Layer, Schema } from "effect";
import { Database } from "../internal/database.ts";
import { humanTasks } from "./schema.ts";

type Row = typeof humanTasks.$inferSelect;

const normalizeRow = (row: Row) => {
  const { context, result, completedAt, ...request } = row;
  const normalized: typeof request & {
    context?: string;
    result?: Row["result"];
    completedAt?: string;
  } = { ...request };
  if (context !== null) normalized.context = context;
  if (result !== null) normalized.result = result;
  if (completedAt !== null) normalized.completedAt = completedAt;
  return normalized;
};

const decodeRow = (row: Row) => Schema.decodeUnknownEffect(HumanTask)(normalizeRow(row));

export const layer = Layer.effect(
  HumanTaskStore.Service,
  Effect.gen(function* () {
    const database = yield* Database.Service;
    const create = Effect.fn("HumanTaskStorePostgres.create")((task: PendingHumanTask) =>
      Schema.encodeEffect(PendingHumanTask)(task).pipe(
        Effect.flatMap((encoded) => database.insert(humanTasks).values(encoded)),
        Effect.as(task),
        Effect.mapError((cause) => new HumanTaskStore.PersistenceError({ cause })),
      ),
    );
    const get = Effect.fn("HumanTaskStorePostgres.get")(function* (id: HumanTaskId) {
      const rows = yield* database
        .select()
        .from(humanTasks)
        .where(eq(humanTasks.id, id))
        .pipe(Effect.mapError((cause) => new HumanTaskStore.PersistenceError({ cause })));
      const row = rows[0];
      if (row === undefined) return yield* new HumanTaskStore.NotFound({ id });
      return yield* decodeRow(row).pipe(
        Effect.mapError((cause) => new HumanTaskStore.PersistenceError({ cause })),
      );
    });
    const list = database
      .select()
      .from(humanTasks)
      .pipe(
        Effect.flatMap((rows) => Effect.forEach(rows, decodeRow)),
        Effect.mapError((cause) => new HumanTaskStore.PersistenceError({ cause })),
      );
    const complete = Effect.fn("HumanTaskStorePostgres.complete")(function* (
      id: HumanTaskId,
      result: ApprovalResult,
      completedAt: DateTime.Utc,
    ) {
      // PostgreSQL rechecks the predicate after a competing writer releases its row lock.
      const rows = yield* database
        .update(humanTasks)
        .set({ status: "completed", result, completedAt: DateTime.formatIso(completedAt) })
        .where(and(eq(humanTasks.id, id), eq(humanTasks.status, "pending")))
        .returning()
        .pipe(Effect.mapError((cause) => new HumanTaskStore.PersistenceError({ cause })));
      const row = rows[0];
      if (row === undefined) {
        yield* get(id);
        return yield* new HumanTaskStore.AlreadyCompleted({ id });
      }
      return yield* Schema.decodeUnknownEffect(CompletedHumanTask)(normalizeRow(row)).pipe(
        Effect.mapError((cause) => new HumanTaskStore.PersistenceError({ cause })),
      );
    });
    return HumanTaskStore.Service.of({ create, get, list, complete });
  }),
);

export * as HumanTaskStorePostgres from "./human-task-store-postgres.ts";
