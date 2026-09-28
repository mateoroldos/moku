import { assert, it } from "@effect/vitest";
import { ApprovalResult, HumanTaskId, HumanTaskTitle } from "@moku/domain/human-task";
import { DateTime, Effect, Layer, PlatformError, Result, Schema } from "effect";
import { TestClock } from "effect/testing";
import { CryptoDeterministic } from "../test/crypto-deterministic.ts";
import { HumanTaskDirectory } from "./human-task-directory.ts";
import { HumanTaskStore } from "./human-task-store.ts";
import { HumanTaskStoreMemory } from "./human-task-store-memory.ts";

const firstId = HumanTaskId.make("00000000-0000-4000-8000-000000000001");
const input = HumanTaskDirectory.CreateInput.make({
  intent: "authorize",
  subject: {
    title: HumanTaskTitle.make("Publish the report"),
    description: "Weekly summary",
  },
  context: "Send the reviewed report to leadership.",
  response: { type: "approval" },
});

const testLayer = HumanTaskDirectory.layer.pipe(
  Layer.provide(Layer.merge(HumanTaskStoreMemory.layer, CryptoDeterministic.layer)),
);

it.effect.each(["approved", "rejected"] as const)(
  "completes a task with an %s result and server-owned time",
  (decision) =>
    Effect.gen(function* () {
      const directory = yield* HumanTaskDirectory.Service;
      yield* TestClock.setTime(1_000);
      const pending = yield* directory.create(input);
      yield* TestClock.setTime(2_000);
      const response = {
        decision,
        feedback: "Reviewed the underlying figures.\nReady for the next step.",
      };
      const completed = yield* directory.respond(pending.id, response);
      const { status: _, ...request } = pending;
      assert.deepStrictEqual(completed, {
        ...request,
        status: "completed",
        result: response,
        completedAt: DateTime.makeUnsafe(2_000),
      });
      assert.deepStrictEqual(yield* directory.get(pending.id), completed);
      assert.deepStrictEqual(yield* directory.list, [completed]);
      assert.strictEqual(pending.status, "pending");
      assert.notProperty(pending, "result");
    }).pipe(Effect.provide(testLayer)),
);

it.effect("preserves the first result and timestamp on identical or conflicting retries", () =>
  Effect.gen(function* () {
    const directory = yield* HumanTaskDirectory.Service;
    const pending = yield* directory.create(input);
    const first = yield* directory.respond(pending.id, { decision: "approved" });
    assert.notProperty(first.result, "feedback");
    yield* TestClock.adjust(1_000);
    for (const decision of ["approved", "rejected"] as const) {
      const failure = yield* Effect.flip(directory.respond(pending.id, { decision }));
      assert.deepStrictEqual(failure, new HumanTaskStore.AlreadyCompleted({ id: pending.id }));
      assert.deepStrictEqual(yield* directory.get(pending.id), first);
    }
  }).pipe(Effect.provide(testLayer)),
);

it.effect("schema validation rejects malformed answers before submission", () =>
  Effect.gen(function* () {
    const directory = yield* HumanTaskDirectory.Service;
    const pending = yield* directory.create(input);
    for (const response of [
      null,
      {},
      { decision: "executed" },
      { decision: "approved", feedback: 42 },
      { decision: "approved", feedback: undefined },
      { decision: "approved", completedAt: "2026-01-01T00:00:00Z" },
    ]) {
      const failure = yield* Effect.flip(
        Schema.decodeUnknownEffect(ApprovalResult, { onExcessProperty: "error" })(response).pipe(
          Effect.flatMap((result) => directory.respond(pending.id, result)),
        ),
      );
      assert.strictEqual(failure._tag, "SchemaError");
      assert.deepStrictEqual(yield* directory.get(pending.id), pending);
    }
    const completed = yield* directory.respond(pending.id, { decision: "rejected" });
    assert.strictEqual(completed.result.decision, "rejected");
  }).pipe(Effect.provide(testLayer)),
);

it.effect("cannot respond to a missing task", () =>
  Effect.gen(function* () {
    const directory = yield* HumanTaskDirectory.Service;
    const failure = yield* Effect.flip(directory.respond(firstId, { decision: "approved" }));
    assert.deepStrictEqual(failure, new HumanTaskStore.NotFound({ id: firstId }));
    assert.deepStrictEqual(yield* directory.list, []);
  }).pipe(Effect.provide(testLayer)),
);

it.effect("exposes one completed result when callers submit competing decisions", () =>
  Effect.gen(function* () {
    const directory = yield* HumanTaskDirectory.Service;
    const pending = yield* directory.create(input);
    const outcomes = yield* Effect.forEach(
      ["approved", "rejected"] as const,
      (decision) => Effect.result(directory.respond(pending.id, { decision })),
      { concurrency: "unbounded" },
    );
    const winners = outcomes.filter(Result.isSuccess).map((outcome) => outcome.success);
    const failures = outcomes.filter(Result.isFailure).map((outcome) => outcome.failure);
    assert.lengthOf(winners, 1);
    assert.deepStrictEqual(failures, [new HumanTaskStore.AlreadyCompleted({ id: pending.id })]);
    assert.deepStrictEqual([yield* directory.get(pending.id)], winners);
    assert.deepStrictEqual(yield* directory.list, winners);
  }).pipe(Effect.provide(testLayer)),
);

it.effect("propagates a completion write failure without reporting success", () => {
  const failure = new HumanTaskStore.PersistenceError({ cause: new Error("Write failed") });
  const failedWrites = Layer.effect(
    HumanTaskStore.Service,
    Effect.gen(function* () {
      const store = yield* HumanTaskStore.Service;
      return HumanTaskStore.Service.of({ ...store, complete: () => Effect.fail(failure) });
    }),
  ).pipe(Layer.provide(HumanTaskStoreMemory.layer));
  return Effect.gen(function* () {
    const directory = yield* HumanTaskDirectory.Service;
    const pending = yield* directory.create(input);
    assert.strictEqual(
      yield* Effect.flip(directory.respond(pending.id, { decision: "approved" })),
      failure,
    );
    assert.deepStrictEqual(yield* directory.get(pending.id), pending);
  }).pipe(
    Effect.provide(
      HumanTaskDirectory.layer.pipe(
        Layer.provide(Layer.merge(failedWrites, CryptoDeterministic.layer)),
      ),
    ),
  );
});

it("accepts optional context, but rejects explicit undefined or non-text", () => {
  const decode = Schema.decodeUnknownSync(HumanTaskDirectory.CreateInput);
  const { context: _, ...minimalInput } = input;
  const minimal = decode(minimalInput);
  assert.deepStrictEqual(minimal.subject, input.subject);
  assert.notProperty(minimal, "context");
  assert.strictEqual(decode(input).context, input.context);
  for (const context of [undefined, null, 42]) {
    assert.isTrue(
      Result.isFailure(
        Schema.decodeUnknownResult(HumanTaskDirectory.CreateInput)({
          ...input,
          context,
        }),
      ),
    );
  }
});

it.effect("creates distinct pending tasks with creation time and retrieves them", () =>
  Effect.gen(function* () {
    const directory = yield* HumanTaskDirectory.Service;
    assert.deepStrictEqual(yield* directory.list, []);
    yield* TestClock.setTime(1_000);
    const first = yield* directory.create(input);
    yield* TestClock.setTime(2_000);
    const second = yield* directory.create(input);

    assert.strictEqual(first.id, firstId);
    assert.notStrictEqual(first.id, second.id);
    assert.deepStrictEqual(first.subject, input.subject);
    assert.strictEqual(first.context, input.context);
    assert.deepStrictEqual(first.response, input.response);
    assert.strictEqual(first.status, "pending");
    assert.strictEqual(DateTime.toEpochMillis(first.createdAt), 1_000);
    assert.strictEqual(DateTime.toEpochMillis(second.createdAt), 2_000);
    assert.deepStrictEqual(yield* directory.get(first.id), first);
    assert.deepStrictEqual(yield* directory.get(second.id), second);
    assert.sameDeepMembers([...(yield* directory.list)], [first, second]);
  }).pipe(Effect.provide(testLayer)),
);

it.effect("returns the missing task ID in a typed failure", () =>
  Effect.gen(function* () {
    const directory = yield* HumanTaskDirectory.Service;
    const failure = yield* Effect.flip(directory.get(firstId));
    assert.instanceOf(failure, HumanTaskStore.NotFound);
    assert.deepStrictEqual(failure, new HumanTaskStore.NotFound({ id: firstId }));
  }).pipe(Effect.provide(testLayer)),
);

it.effect("propagates store failures with their diagnostic cause", () => {
  const cause = new Error("Storage unavailable");
  const failure = new HumanTaskStore.PersistenceError({ cause });
  const store = Layer.succeed(HumanTaskStore.Service, {
    create: () => Effect.fail(failure),
    complete: () => Effect.fail(failure),
    get: () => Effect.fail(failure),
    list: Effect.fail(failure),
  });
  return Effect.gen(function* () {
    const directory = yield* HumanTaskDirectory.Service;
    assert.strictEqual(yield* Effect.flip(directory.create(input)), failure);
    assert.strictEqual(yield* Effect.flip(directory.get(firstId)), failure);
    assert.strictEqual(
      yield* Effect.flip(directory.respond(firstId, { decision: "approved" })),
      failure,
    );
    assert.strictEqual(yield* Effect.flip(directory.list), failure);
    assert.strictEqual(failure.cause, cause);
  }).pipe(
    Effect.provide(
      HumanTaskDirectory.layer.pipe(Layer.provide(Layer.merge(store, CryptoDeterministic.layer))),
    ),
  );
});

it.effect("preserves the existing task if an ID collides", () => {
  const fixedCrypto = CryptoDeterministic.randomUUIDLayer(Effect.succeed(firstId));
  return Effect.gen(function* () {
    const directory = yield* HumanTaskDirectory.Service;
    const first = yield* directory.create(input);
    const failure = yield* Effect.flip(
      directory.create(
        HumanTaskDirectory.CreateInput.make({
          ...input,
          subject: { title: HumanTaskTitle.make("A different task") },
        }),
      ),
    );
    assert.instanceOf(failure, HumanTaskStore.PersistenceError);
    assert.deepStrictEqual(yield* directory.get(firstId), first);
    assert.deepStrictEqual(yield* directory.list, [first]);
  }).pipe(
    Effect.provide(
      HumanTaskDirectory.layer.pipe(
        Layer.provide(Layer.merge(HumanTaskStoreMemory.layer, fixedCrypto)),
      ),
    ),
  );
});

const cryptoError = PlatformError.badArgument({
  module: "Crypto",
  method: "randomUUIDv4",
  description: "Randomness unavailable",
});

it.effect.each([
  { label: "unavailable randomness", uuid: Effect.fail(cryptoError) },
  { label: "invalid generated ID", uuid: Effect.succeed("invalid") },
])("fails without storing a task on $label", ({ uuid }) => {
  const failedCrypto = CryptoDeterministic.randomUUIDLayer(uuid);
  return Effect.gen(function* () {
    const directory = yield* HumanTaskDirectory.Service;
    const failure = yield* Effect.flip(directory.create(input));
    assert.instanceOf(failure, HumanTaskDirectory.IdGenerationError);
    assert.isDefined(failure.cause);
    assert.deepStrictEqual(yield* directory.list, []);
  }).pipe(
    Effect.provide(
      HumanTaskDirectory.layer.pipe(
        Layer.provide(Layer.merge(HumanTaskStoreMemory.layer, failedCrypto)),
      ),
    ),
  );
});
