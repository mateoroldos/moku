import { assert, it } from "@effect/vitest";
import { Access } from "@moku/core/access";
import { UserId } from "@moku/domain/identity";
import { Membership, OrganizationId } from "@moku/domain/organization";
import { Effect, Layer, Redacted } from "effect";
import { AuthProvider } from "./auth-provider.ts";
import { AuthGuard } from "./auth-guard.ts";
import { Organizations } from "./organizations.ts";

const unavailable = new AuthProvider.Unavailable({ cause: Redacted.make(new Error("offline")) });
const organizationId = OrganizationId.make("organization");
const dependencies = (
  authenticate: AuthProvider.Interface["authenticate"],
  role: Organizations.Interface["role"] = () => Effect.die("Unexpected membership lookup"),
) =>
  Layer.merge(
    Layer.succeed(AuthProvider.Service, {
      authenticate,
      handle: () => Effect.die("unused"),
    }),
    Layer.succeed(Organizations.Service, {
      role,
      list: () => Effect.die("unused"),
      listMembers: () => Effect.die("unused"),
      create: () => Effect.die("unused"),
      invite: () => Effect.die("unused"),
      changeRole: () => Effect.die("unused"),
      getInvitation: () => Effect.die("unused"),
      acceptInvitation: () => Effect.die("unused"),
      listInvitations: () => Effect.die("unused"),
      cancelInvitation: () => Effect.die("unused"),
    }),
  );

it.effect.each([
  { name: "anonymous", identity: Effect.succeed(null), tag: "AuthGuard.Required" },
  { name: "unavailable", identity: Effect.fail(unavailable), tag: "AuthProvider.Unavailable" },
  {
    name: "unverified",
    identity: Effect.succeed({ userId: UserId.make("alice"), emailVerified: false }),
    tag: "Access.UnverifiedEmail",
  },
])("rejects $name callers before membership lookup", ({ identity, tag }) =>
  Effect.gen(function* () {
    const auth = yield* AuthGuard.make(new Headers());
    const failure = yield* Effect.flip(auth.membership(organizationId));

    assert.strictEqual(failure._tag, tag);
  }).pipe(Effect.provide(dependencies(() => identity))),
);

it.effect("binds membership to the request's identity and requested organization", () =>
  Effect.gen(function* () {
    const auth = yield* AuthGuard.make(new Headers({ cookie: "alice" }));

    assert.deepStrictEqual(
      yield* auth.membership(organizationId),
      Membership.make({ userId: UserId.make("alice"), organizationId, role: "viewer" }),
    );
    assert.deepStrictEqual(
      yield* Effect.flip(auth.membership(OrganizationId.make("other"))),
      new Access.NotFound({}),
    );
  }).pipe(
    Effect.provide(
      dependencies(
        (headers) =>
          Effect.succeed({
            userId: UserId.make(headers.get("cookie") === "alice" ? "alice" : "bob"),
            emailVerified: true,
          }),
        (headers, id) =>
          headers.get("cookie") === "alice" && id === organizationId
            ? Effect.succeed("viewer")
            : Effect.fail(new Access.NotFound({})),
      ),
    ),
  ),
);
