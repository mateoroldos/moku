import { assert, it } from "@effect/vitest";
import { DateTime, Effect, Result, Schema } from "effect";
import { ApprovalResult, HumanTask, HumanTaskId, HumanTaskTitle } from "./human-task.ts";

it("requires UUIDv4 IDs and nonblank, trimmed titles", () => {
  assert.isTrue(Schema.is(HumanTaskId)("00000000-0000-4000-8000-000000000001"));
  for (const id of ["", "task-1", "00000000-0000-7000-8000-000000000001"]) {
    assert.isFalse(Schema.is(HumanTaskId)(id));
  }
  assert.isTrue(Schema.is(HumanTaskTitle)("Review the weekly report"));
  for (const title of ["", " ", "\n", " title", "title ", 42]) {
    assert.isFalse(Schema.is(HumanTaskTitle)(title));
  }
});

it.effect("round-trips pending tasks and rejects invalid time or unsupported status", () =>
  Effect.gen(function* () {
    const encoded = {
      id: "00000000-0000-4000-8000-000000000001",
      organizationId: "test-org",
      intent: "authorize",
      subject: { title: "Publish the weekly report", description: "The report to distribute." },
      context: "Leadership requested this summary.",
      response: { type: "approval" },
      createdAt: "2026-09-25T12:00:00.000Z",
      status: "pending",
    } as const;

    const task = yield* Schema.decodeEffect(HumanTask)(encoded);
    assert.strictEqual(DateTime.formatIso(task.createdAt), encoded.createdAt);
    assert.deepStrictEqual(yield* Schema.encodeEffect(HumanTask)(task), encoded);

    for (const input of [
      { ...encoded, createdAt: "not-a-date" },
      { ...encoded, status: "completed" },
      { ...encoded, status: "cancelled" },
      { ...encoded, status: "pending", result: { decision: "approved" } },
      { ...encoded, status: "pending", completedAt: encoded.createdAt },
      { ...encoded, attribution: { userId: "user", role: "member" } },
      { ...encoded, organizationId: "" },
      { ...encoded, context: undefined },
      { ...encoded, context: null },
      { ...encoded, context: 42 },
      { ...encoded, response: { type: "selection" } },
      { ...encoded, intent: "execute" },
      { ...encoded, subject: { title: " " } },
    ]) {
      assert.isTrue(
        Result.isFailure(yield* Effect.result(Schema.decodeUnknownEffect(HumanTask)(input))),
      );
    }
  }),
);

it.effect("round-trips completed tasks with structured results and requires completion data", () =>
  Effect.gen(function* () {
    const encoded = {
      id: "00000000-0000-4000-8000-000000000001",
      organizationId: "test-org",
      intent: "authorize",
      subject: { title: "Publish the report" },
      response: { type: "approval" },
      createdAt: "2026-09-25T12:00:00.000Z",
      status: "completed",
      result: {
        decision: "rejected",
        feedback: "Correct the revenue figures first.\nKeep the appendix.",
      },
      completedAt: "2026-09-25T13:00:00.000Z",
      attribution: { userId: "user", role: "member" },
    } as const;

    const task = yield* Schema.decodeEffect(HumanTask)(encoded);
    assert.strictEqual(task.status, "completed");
    if (task.status !== "completed") return assert.fail("Expected completed task");
    assert.deepStrictEqual(task.result, encoded.result);
    assert.strictEqual(DateTime.formatIso(task.completedAt), encoded.completedAt);
    assert.deepStrictEqual(yield* Schema.encodeEffect(HumanTask)(task), encoded);

    for (const invalid of [
      { ...encoded, result: undefined },
      { ...encoded, attribution: undefined },
      { ...encoded, attribution: { userId: "user", role: "superuser" } },
      { ...encoded, completedAt: undefined },
      { ...encoded, completedAt: "invalid" },
      { ...encoded, result: { decision: "executed" } },
    ]) {
      assert.isTrue(
        Result.isFailure(yield* Effect.result(Schema.decodeUnknownEffect(HumanTask)(invalid))),
      );
    }
  }),
);

it("accepts approval decisions with optional text feedback only", () => {
  const decode = Schema.decodeUnknownResult(ApprovalResult, { onExcessProperty: "error" });

  for (const decision of ["approved", "rejected"]) {
    assert.isTrue(Result.isSuccess(decode({ decision })));
    assert.isTrue(Result.isSuccess(decode({ decision, feedback: "" })));
  }

  for (const invalid of [
    null,
    {},
    { decision: "approve" },
    { decision: "approved", feedback: undefined },
    { decision: "approved", feedback: 42 },
    { decision: "approved", completedAt: "2026-01-01T00:00:00Z" },
  ]) {
    assert.isTrue(Result.isFailure(decode(invalid)));
  }
});
