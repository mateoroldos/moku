import { Schema } from "effect";

export const HumanTaskId = Schema.String.pipe(
  Schema.check(Schema.isUUID(4)),
  Schema.brand("HumanTaskId"),
);
export type HumanTaskId = typeof HumanTaskId.Type;

export const HumanTaskTitle = Schema.String.pipe(
  Schema.check(Schema.isTrimmed(), Schema.isMinLength(1)),
  Schema.brand("HumanTaskTitle"),
);
export type HumanTaskTitle = typeof HumanTaskTitle.Type;

export const HumanTask = Schema.Struct({
  id: HumanTaskId,
  title: HumanTaskTitle,
  description: Schema.optionalKey(Schema.String),
  createdAt: Schema.DateTimeUtcFromString,
  status: Schema.Literal("pending"),
});
export interface HumanTask extends Schema.Schema.Type<typeof HumanTask> {}
