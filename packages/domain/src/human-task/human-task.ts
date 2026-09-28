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

export const HumanTaskSubject = Schema.Struct({
  title: HumanTaskTitle,
  description: Schema.optionalKey(Schema.String),
});
export interface HumanTaskSubject extends Schema.Schema.Type<typeof HumanTaskSubject> {}

export const ApprovalResponse = Schema.Struct({
  type: Schema.Literal("approval"),
});
export interface ApprovalResponse extends Schema.Schema.Type<typeof ApprovalResponse> {}

export const ApprovalResult = Schema.Struct({
  decision: Schema.Literals(["approved", "rejected"]),
  feedback: Schema.optionalKey(Schema.String),
});
export interface ApprovalResult extends Schema.Schema.Type<typeof ApprovalResult> {}

const fields = {
  id: HumanTaskId,
  intent: Schema.Literal("authorize"),
  subject: HumanTaskSubject,
  context: Schema.optionalKey(Schema.String),
  response: ApprovalResponse,
  createdAt: Schema.DateTimeUtcFromString,
};

export const PendingHumanTask = Schema.Struct({
  ...fields,
  status: Schema.Literal("pending"),
  result: Schema.optionalKey(Schema.Never),
  completedAt: Schema.optionalKey(Schema.Never),
});
export interface PendingHumanTask extends Schema.Schema.Type<typeof PendingHumanTask> {}

export const CompletedHumanTask = Schema.Struct({
  ...fields,
  status: Schema.Literal("completed"),
  result: ApprovalResult,
  completedAt: Schema.DateTimeUtcFromString,
});
export interface CompletedHumanTask extends Schema.Schema.Type<typeof CompletedHumanTask> {}

export const HumanTask = Schema.Union([PendingHumanTask, CompletedHumanTask]);
export type HumanTask = typeof HumanTask.Type;
