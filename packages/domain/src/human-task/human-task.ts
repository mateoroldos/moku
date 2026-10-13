import { Schema } from "effect";
import { UserId } from "../identity/identity.ts";
import { OrganizationId, OrganizationKey, OrganizationRole } from "../organization/organization.ts";

export const HumanTaskId = Schema.String.pipe(
  Schema.check(Schema.isUUID(4)),
  Schema.brand("HumanTaskId"),
);
export type HumanTaskId = typeof HumanTaskId.Type;

export const TaskRef = Schema.Struct({ organizationId: OrganizationId, taskId: HumanTaskId });
export interface TaskRef extends Schema.Schema.Type<typeof TaskRef> {}

export const ResponseAttribution = Schema.Struct({ userId: UserId, role: OrganizationRole });
export interface ResponseAttribution extends Schema.Schema.Type<typeof ResponseAttribution> {}

/** The API key that created the task; its name is kept so the task still shows it after revocation. */
export const TaskRequester = Schema.Struct({
  id: OrganizationKey.fields.id,
  name: OrganizationKey.fields.name,
});
export interface TaskRequester extends Schema.Schema.Type<typeof TaskRequester> {}

/** Where Moku sends a task once it completes. Anyone holding it can act on the
 * requester's behalf, so it never leaves the server. */
export const CallbackUrl = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^https?:\/\/\S+$/)),
  Schema.brand("CallbackUrl"),
);
export type CallbackUrl = typeof CallbackUrl.Type;

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
  organizationId: OrganizationId,
  intent: Schema.Literal("authorize"),
  subject: HumanTaskSubject,
  context: Schema.optionalKey(Schema.String),
  response: ApprovalResponse,
  requester: TaskRequester,
  createdAt: Schema.DateTimeUtcFromString,
};

export const PendingHumanTask = Schema.Struct({
  ...fields,
  status: Schema.Literal("pending"),
  result: Schema.optionalKey(Schema.Never),
  completedAt: Schema.optionalKey(Schema.Never),
  attribution: Schema.optionalKey(Schema.Never),
});
export interface PendingHumanTask extends Schema.Schema.Type<typeof PendingHumanTask> {}

export const CompletedHumanTask = Schema.Struct({
  ...fields,
  status: Schema.Literal("completed"),
  result: ApprovalResult,
  completedAt: Schema.DateTimeUtcFromString,
  attribution: ResponseAttribution,
});
export interface CompletedHumanTask extends Schema.Schema.Type<typeof CompletedHumanTask> {}

export const HumanTask = Schema.Union([PendingHumanTask, CompletedHumanTask]);
export type HumanTask = typeof HumanTask.Type;
