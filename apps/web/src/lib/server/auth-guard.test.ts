import { assert, it } from "@effect/vitest";
import { Effect, Redacted, Result } from "effect";
import { Authentication } from "./authentication.ts";
import { AuthGuard } from "./auth-guard.ts";

const unavailable = new Authentication.Unavailable({ cause: Redacted.make(new Error("offline")) });

it.effect.each([
  { name: "anonymous", auth: Result.succeed(null), tag: "AuthGuard.Required" },
  {
    name: "unverified",
    auth: Result.succeed({ id: "alice", emailVerified: false }),
    tag: "AuthGuard.Unverified",
  },
  { name: "unavailable", auth: Result.fail(unavailable), tag: "Authentication.Unavailable" },
])("rejects $name identity without treating outages as signout", ({ auth, tag }) =>
  Effect.gen(function* () {
    const failure = yield* Effect.flip(AuthGuard.requireVerified({ auth }));
    assert.strictEqual(failure._tag, tag);
  }),
);

it.effect("allows verified identity from request locals", () =>
  Effect.gen(function* () {
    const user = yield* AuthGuard.requireVerified({
      auth: Result.succeed({ id: "alice", emailVerified: true }),
    });
    assert.deepStrictEqual(user, { id: "alice", emailVerified: true });
  }),
);
