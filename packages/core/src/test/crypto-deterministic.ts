import { Crypto, Effect, Layer, type PlatformError } from "effect";

/** Test-only Crypto: sequential UUIDv4 values, zero-filled bytes, and identity digests. */
export const layer = Layer.sync(Crypto.Crypto, () => {
  let sequence = 0;
  const crypto = Crypto.make({
    randomBytes: (size) => new Uint8Array(size),
    digest: (_algorithm, data) => Effect.succeed(data),
  });
  return Crypto.Crypto.of({
    ...crypto,
    randomUUIDv4: Effect.sync(
      () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, "0")}`,
    ),
  });
});

/** Overrides UUID generation for collision and failure scenarios. */
export const randomUUIDLayer = (uuid: Effect.Effect<string, PlatformError.PlatformError>) =>
  Layer.effect(
    Crypto.Crypto,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      return Crypto.Crypto.of({ ...crypto, randomUUIDv4: uuid });
    }),
  ).pipe(Layer.provide(layer));

export * as CryptoDeterministic from "./crypto-deterministic.ts";
