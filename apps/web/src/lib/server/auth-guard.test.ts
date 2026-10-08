import { assert, it } from "@effect/vitest";
import { UserId } from "@moku/domain/identity";
import { Membership, OrganizationId } from "@moku/domain/organization";
import { Effect, Layer, Redacted } from "effect";
import { AuthProvider } from "./auth-provider.ts";
import { AuthGuard } from "./auth-guard.ts";
import { Organizations } from "./organizations.ts";

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

const organizationId = OrganizationId.make("organization");
const organizations = (role: Organizations.Interface["role"]) =>
  Layer.succeed(Organizations.Service, {
    role,
    list: () => Effect.die("unused"),
    listMembers: () => Effect.die("unused"),
    createWithOwner: () => Effect.die("unused"),
  });

it.effect.each([
  { name: "anonymous", identity: null, tag: "AuthGuard.Required" },
  {
    name: "unverified",
    identity: { userId: UserId.make("alice"), emailVerified: false },
    tag: "Access.UnverifiedEmail",
  },
])("rejects $name callers before any membership lookup", ({ identity, tag }) =>
  Effect.gen(function* () {
    const failure = yield* Effect.flip(
      AuthGuard.requireMembership(Effect.succeed(identity), new Headers(), organizationId),
    );
    assert.strictEqual(failure._tag, tag);
  }).pipe(Effect.provide(organizations(() => Effect.die("Looked up membership")))),
);

it.effect("scopes the resolved role to the verified caller and requested organization", () =>
  Effect.gen(function* () {
    const membership = yield* AuthGuard.requireMembership(
      Effect.succeed({ userId: UserId.make("alice"), emailVerified: true }),
      new Headers(),
      organizationId,
    );
    assert.deepStrictEqual(
      membership,
      Membership.make({ userId: UserId.make("alice"), organizationId, role: "viewer" }),
    );
  }).pipe(Effect.provide(organizations(() => Effect.succeed("viewer")))),
);
