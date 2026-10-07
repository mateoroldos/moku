import { assert, it } from "@effect/vitest";
import { UserId } from "@moku/domain/identity";
import { Effect, Redacted } from "effect";
import { AuthProvider } from "./auth-provider.ts";
import { AuthGuard } from "./auth-guard.ts";

const unavailable = new AuthProvider.Unavailable({ cause: Redacted.make(new Error("offline")) });

it.effect.each([
  { name: "anonymous", auth: Effect.succeed(null), tag: "AuthGuard.Required" },
  {
    name: "unverified",
    auth: Effect.succeed({ userId: UserId.make("alice"), emailVerified: false }),
    tag: "Access.UnverifiedEmail",
  },
  { name: "unavailable", auth: Effect.fail(unavailable), tag: "AuthProvider.Unavailable" },
])("rejects $name identity without treating outages as signout", ({ auth, tag }) =>
  Effect.gen(function* () {
    const failure = yield* Effect.flip(AuthGuard.requireVerifiedEmail(auth));
    assert.strictEqual(failure._tag, tag);
  }),
);

it.effect("allows a verified principal", () =>
  Effect.gen(function* () {
    const principal = yield* AuthGuard.requireVerifiedEmail(
      Effect.succeed({ userId: UserId.make("alice"), emailVerified: true }),
    );
    assert.deepStrictEqual(principal, { userId: "alice", emailVerified: true });
  }),
);
