import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const authMailAdmission = pgTable(
  "auth_mail_admission",
  {
    addressKey: text("address_key").primaryKey(),
    nextAllowedAt: timestamp("next_allowed_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("auth_mail_admission_expiry_idx").on(table.nextAllowedAt)],
);
