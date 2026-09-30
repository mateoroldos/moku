/* oxlint-disable effecttsgo/prefer-schema-over-json -- Native diagnostic serialization must not disclose rejected configuration or secrets. */
import { assert, it } from "@effect/vitest";
import { ConfigProvider, Effect, Redacted } from "effect";
import { AuthConfig } from "./auth-config.ts";

const secret = "configuration-test-secret-at-least-32-characters";
const load = (origin: string, value = secret) =>
  AuthConfig.load.pipe(
    Effect.provide(
      ConfigProvider.layer(ConfigProvider.fromUnknown({ AUTH_ORIGIN: origin, AUTH_SECRET: value })),
    ),
  );

it.effect("accepts explicit HTTPS and loopback origins with a redacted secret", () =>
  Effect.gen(function* () {
    for (const origin of [
      "https://moku.example",
      "http://127.0.0.1:5173",
      "http://localhost:3000",
    ]) {
      const settings = yield* load(origin);
      assert.equal(settings.origin.origin, origin);
      assert.equal(Redacted.value(settings.secret), secret);
      assert.notInclude(JSON.stringify(settings), secret);
    }
  }),
);

it.effect(
  "rejects unsafe origins and short secrets without including their values in failures",
  () =>
    Effect.gen(function* () {
      for (const origin of [
        "http://moku.example",
        "https://user:password@moku.example",
        "https://moku.example/api/auth",
        "https://moku.example?",
        "https://moku.example#",
        "not-a-url",
      ]) {
        const failure = yield* load(origin).pipe(Effect.flip);
        assert.instanceOf(failure, AuthConfig.Invalid);
        assert.notInclude(JSON.stringify(failure), origin);
      }
      const failure = yield* load("https://moku.example", "short-secret").pipe(Effect.flip);
      assert.instanceOf(failure, AuthConfig.Invalid);
      assert.notInclude(JSON.stringify(failure), "short-secret");
    }),
);
