import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization } from "../auth/schema.ts";

export const humanTasks = pgTable(
  "human_tasks",
  {
    id: uuid("id").primaryKey(),
    // Better Auth deletes an organization in one transaction and runs its hooks outside it;
    // the cascade deletes its tasks inside that transaction.
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    intent: text("intent").notNull(),
    subject: jsonb("subject").notNull(),
    context: text("context"),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at", {
      mode: "string",
      withTimezone: true,
      precision: 3,
    }).notNull(),
    status: text("status").notNull(),
    result: jsonb("result"),
    attribution: jsonb("attribution"),
    completedAt: timestamp("completed_at", { mode: "string", withTimezone: true, precision: 3 }),
  },
  (table) => [
    check(
      "human_tasks_lifecycle",
      sql`(
    ${table.status} = 'pending' AND ${table.result} IS NULL AND ${table.completedAt} IS NULL AND ${table.attribution} IS NULL
  ) OR (
    ${table.status} = 'completed' AND ${table.result} IS NOT NULL AND ${table.completedAt} IS NOT NULL AND ${table.attribution} IS NOT NULL
  )`,
    ),
  ],
);
