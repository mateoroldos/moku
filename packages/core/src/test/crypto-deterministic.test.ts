import { assert, it } from "@effect/vitest";
import { HumanTaskId } from "@moku/domain/human-task";
import { Crypto, Effect, Schema } from "effect";
import { CryptoDeterministic } from "./crypto-deterministic.ts";

it.effect("generates distinct valid UUIDv4s and resets the sequence per build", () =>
  Effect.gen(function* () {
    const sequence = Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      const first = yield* crypto.randomUUIDv4;
      const second = yield* crypto.randomUUIDv4;
      assert.isTrue(Schema.is(HumanTaskId)(first));
      assert.isTrue(Schema.is(HumanTaskId)(second));
      assert.notStrictEqual(first, second);
      return [first, second];
    }).pipe(Effect.provide(CryptoDeterministic.layer));

    assert.deepStrictEqual(yield* sequence, yield* sequence);
  }),
);
