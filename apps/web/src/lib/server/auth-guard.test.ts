import { assert, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer, Redacted } from "effect";
import { Authentication } from "./authentication.ts";
import { AuthGuard } from "./auth-guard.ts";

const request = (): Authentication.RequestContext => ({
  request: new Request("http://localhost/"),
  locals: {},
});
const provider = (lookup: ReturnType<Authentication.Interface["authenticate"]>) =>
  Layer.succeed(Authentication.Service, {
    authenticate: () => lookup,
    handle: () => Effect.succeed(new Response(null, { status: 404 })),
  });

const unavailable = new Authentication.Unavailable({ cause: Redacted.make(new Error("offline")) });

it.effect.each([
  { name: "anonymous", lookup: Effect.succeed(null), tag: "AuthGuard.Required" },
  {
    name: "unverified",
    lookup: Effect.succeed({ id: "alice", emailVerified: false }),
    tag: "AuthGuard.Unverified",
  },
  { name: "unavailable", lookup: Effect.fail(unavailable), tag: "Authentication.Unavailable" },
])("rejects $name identity without treating outages as signout", ({ lookup, tag }) =>
  Effect.gen(function* () {
    const failure = yield* Effect.flip(AuthGuard.requireVerified(request()));
    assert.strictEqual(failure._tag, tag);
  }).pipe(Effect.provide(provider(lookup))),
);

it.effect(
  "shares a lazy session snapshot across concurrent consumers, then observes revocation on the next request",
  () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let reads = 0;
      let user: { id: string; emailVerified: boolean } | null = {
        id: "alice",
        emailVerified: true,
      };
      const lookup = Effect.gen(function* () {
        reads++;
        yield* Deferred.succeed(started, undefined);
        yield* Deferred.await(release);
        return user;
      });
      yield* Effect.gen(function* () {
        const event = request();
        const session = Authentication.session(event);
        assert.strictEqual(reads, 0);
        const consumers = yield* Effect.forkChild(
          Effect.all([session, AuthGuard.requireVerified({ ...event })], {
            concurrency: "unbounded",
          }),
        );
        yield* Deferred.await(started);
        yield* Deferred.succeed(release, undefined);
        assert.deepStrictEqual(yield* Fiber.join(consumers), [
          { id: "alice", emailVerified: true },
          { id: "alice", emailVerified: true },
        ]);
        assert.strictEqual(reads, 1);
        user = null;
        assert.deepStrictEqual(yield* Authentication.session(event), {
          id: "alice",
          emailVerified: true,
        });
        assert.strictEqual(yield* Authentication.session(request()), null);
      }).pipe(Effect.provide(provider(lookup)));
    }),
);
