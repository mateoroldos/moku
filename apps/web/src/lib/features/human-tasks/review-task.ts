import type { ApprovalResult, HumanTask, PendingHumanTask } from "@moku/domain/human-task";
import type { Schema } from "effect";

type PersistedTask = Schema.Codec.Encoded<typeof HumanTask>;
type PendingTask = Schema.Codec.Encoded<typeof PendingHumanTask>;

export type ReviewTask =
  | PersistedTask
  | (Omit<PendingTask, "status"> & {
      readonly status: "submitting";
      readonly answer: ApprovalResult;
    });
