import { assert, it } from "@effect/vitest";
import { UserId } from "@moku/domain/identity";
import { Effect, Redacted } from "effect";
import { AuthProvider } from "./auth-provider.ts";
import { AuthGuard } from "./auth-guard.ts";

const unavailable = new AuthProvider.Unavailable({ cause: Redacted.make(new Error("offline")) });

it.effect.each([
  { name: "anonymous", auth: Effect.succeed(null), tag: "AuthGuard.Required" },
  { name: "unavailable", auth: Effect.fail(unavailable), tag: "AuthProvider.Unavailable" },
])("rejects $name identity without treating outages as signout", ({ auth, tag }) =>
  Effect.gen(function* () {
    const failure = yield* Effect.flip(AuthGuard.requirePrincipal(auth));
    assert.strictEqual(failure._tag, tag);
  }),
);

it.effect.each([true, false])(
  "returns authenticated identity with emailVerified=%s",
  (emailVerified) =>
    Effect.gen(function* () {
      const identity = { userId: UserId.make("alice"), emailVerified };

      const principal = yield* AuthGuard.requirePrincipal(Effect.succeed(identity));

      assert.strictEqual(principal, identity);
    }),
);
