import { assert, it } from "@effect/vitest";
import { DateTime, Effect, Result, Schema } from "effect";
import { HumanTask, HumanTaskId, HumanTaskTitle } from "./human-task.ts";

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
      title: "Review the weekly report",
      createdAt: "2026-09-25T12:00:00.000Z",
      status: "pending",
    };
    const task = yield* Schema.decodeUnknownEffect(HumanTask)(encoded);
    assert.strictEqual(DateTime.formatIso(task.createdAt), encoded.createdAt);
    assert.deepStrictEqual(yield* Schema.encodeEffect(HumanTask)(task), encoded);
    for (const input of [
      { ...encoded, createdAt: "not-a-date" },
      { ...encoded, status: "completed" },
    ]) {
      assert.isTrue(
        Result.isFailure(yield* Effect.result(Schema.decodeUnknownEffect(HumanTask)(input))),
      );
    }
  }),
);
