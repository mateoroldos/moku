import { HumanTaskStore } from "@moku/core/human-task-store";
import {
  type ApprovalResult,
  CompletedHumanTask,
  HumanTask,
  type TaskRef,
  type ResponseAttribution,
  PendingHumanTask,
} from "@moku/domain/human-task";
import type { OrganizationId } from "@moku/domain/organization";
import { and, eq } from "drizzle-orm";
import { DateTime, Effect, Layer, Schema } from "effect";
import { Database } from "../internal/database.ts";
import { humanTasks } from "./schema.ts";

type Row = typeof humanTasks.$inferSelect;

const normalizeRow = (row: Row) => {
  const { context, result, completedAt, attribution, ...request } = row;
  const normalized: typeof request & {
    context?: string;
    result?: Row["result"];
    completedAt?: string;
    attribution?: Row["attribution"];
  } = { ...request };
  if (context !== null) normalized.context = context;
  if (result !== null) normalized.result = result;
  if (completedAt !== null) normalized.completedAt = completedAt;
  if (attribution !== null) normalized.attribution = attribution;
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
    const get = Effect.fn("HumanTaskStorePostgres.get")(function* (ref: TaskRef) {
      const rows = yield* database
        .select()
        .from(humanTasks)
        .where(
          and(eq(humanTasks.id, ref.taskId), eq(humanTasks.organizationId, ref.organizationId)),
        )
        .pipe(Effect.mapError((cause) => new HumanTaskStore.PersistenceError({ cause })));
      const row = rows[0];
      if (row === undefined) return yield* new HumanTaskStore.NotFound(ref);
      return yield* decodeRow(row).pipe(
        Effect.mapError((cause) => new HumanTaskStore.PersistenceError({ cause })),
      );
    });
    const list = (organizationId: OrganizationId) =>
      database
        .select()
        .from(humanTasks)
        .where(eq(humanTasks.organizationId, organizationId))
        .pipe(
          Effect.flatMap((rows) => Effect.forEach(rows, decodeRow)),
          Effect.mapError((cause) => new HumanTaskStore.PersistenceError({ cause })),
        );
    const complete = Effect.fn("HumanTaskStorePostgres.complete")(function* (
      ref: TaskRef,
      result: ApprovalResult,
      completedAt: DateTime.Utc,
      attribution: ResponseAttribution,
    ) {
      // PostgreSQL rechecks the predicate after a competing writer releases its row lock.
      const rows = yield* database
        .update(humanTasks)
        .set({
          status: "completed",
          result,
          attribution,
          completedAt: DateTime.formatIso(completedAt),
        })
        .where(
          and(
            eq(humanTasks.organizationId, ref.organizationId),
            eq(humanTasks.id, ref.taskId),
            eq(humanTasks.status, "pending"),
          ),
        )
        .returning()
        .pipe(Effect.mapError((cause) => new HumanTaskStore.PersistenceError({ cause })));
      const row = rows[0];
      if (row === undefined) {
        yield* get(ref);
        return yield* new HumanTaskStore.AlreadyCompleted(ref);
      }
      return yield* Schema.decodeUnknownEffect(CompletedHumanTask)(normalizeRow(row)).pipe(
        Effect.mapError((cause) => new HumanTaskStore.PersistenceError({ cause })),
      );
    });
    return HumanTaskStore.Service.of({ create, get, list, complete });
  }),
);

export * as HumanTaskStorePostgres from "./human-task-store-postgres.ts";
