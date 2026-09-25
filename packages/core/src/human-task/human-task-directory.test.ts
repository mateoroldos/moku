import { assert, it } from "@effect/vitest";
import { HumanTaskId, HumanTaskTitle } from "@moku/domain/human-task";
import { DateTime, Effect, Layer, PlatformError, Result, Schema } from "effect";
import { TestClock } from "effect/testing";
import { CryptoDeterministic } from "../test/crypto-deterministic.ts";
import { HumanTaskDirectory } from "./human-task-directory.ts";
import { HumanTaskStore } from "./human-task-store.ts";
import { HumanTaskStoreMemory } from "./human-task-store-memory.ts";

const firstId = HumanTaskId.make("00000000-0000-4000-8000-000000000001");
const input = HumanTaskDirectory.CreateInput.make({
  title: HumanTaskTitle.make("Review the report"),
  description: "Weekly summary",
});

const testLayer = HumanTaskDirectory.layer.pipe(
  Layer.provide(Layer.merge(HumanTaskStoreMemory.layer, CryptoDeterministic.layer)),
);

it("accepts an omitted description, but rejects explicit undefined or non-text", () => {
  const decode = Schema.decodeUnknownSync(HumanTaskDirectory.CreateInput);
  const minimal = decode({ title: "Review" });
  assert.strictEqual(minimal.title, "Review");
  assert.notProperty(minimal, "description");
  const input = { title: "Review", description: "First line\n  Second line" };
  const described = decode(input);
  assert.strictEqual(described.title, input.title);
  assert.strictEqual(described.description, input.description);
  for (const description of [undefined, null, 42]) {
    assert.isTrue(
      Result.isFailure(
        Schema.decodeUnknownResult(HumanTaskDirectory.CreateInput)({
          title: "Review",
          description,
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
    assert.strictEqual(first.title, input.title);
    assert.strictEqual(first.description, input.description);
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
    get: () => Effect.fail(failure),
    list: Effect.fail(failure),
  });
  return Effect.gen(function* () {
    const directory = yield* HumanTaskDirectory.Service;
    assert.strictEqual(yield* Effect.flip(directory.create(input)), failure);
    assert.strictEqual(yield* Effect.flip(directory.get(firstId)), failure);
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
        HumanTaskDirectory.CreateInput.make({ title: HumanTaskTitle.make("A different task") }),
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
