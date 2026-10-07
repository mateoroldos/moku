import { assert, it } from "@effect/vitest";
import { UserId } from "@moku/domain/identity";
import { OrganizationId, type OrganizationRole } from "@moku/domain/organization";
import { Effect, Layer, Option } from "effect";
import { Access } from "../access/access.ts";
import { OrganizationMembershipStore } from "../access/organization-membership-store.ts";
import { OrganizationDirectory } from "./organization-directory.ts";

const organizationId = OrganizationId.make("team");
const principal = { userId: UserId.make("reviewer"), emailVerified: true };
const roster = [
  {
    userId: UserId.make("teammate"),
    name: "Alex",
    email: "alex@example.test",
    role: "owner" as const,
  },
];
const memberships = (role: OrganizationRole): OrganizationMembershipStore.Interface => {
  const find: OrganizationMembershipStore.Interface["find"] = (userId, id) =>
    Effect.succeed(
      userId === principal.userId && id === organizationId
        ? Option.some({ userId, organizationId: id, role })
        : Option.none(),
    );

  return {
    find,
    findForWrite: find,
    list: () => Effect.succeed([]),
    listMembers: (id) => Effect.succeed(id === organizationId ? roster : []),
  };
};
const layer = (store: OrganizationMembershipStore.Interface) =>
  OrganizationDirectory.layer.pipe(
    Layer.provide(Layer.succeed(OrganizationMembershipStore.Service, store)),
  );

it.effect.each(["owner", "admin", "member", "viewer"] as const)(
  "allows a verified %s to read their team's roster",
  (role) =>
    Effect.gen(function* () {
      const directory = yield* OrganizationDirectory.Service;

      assert.deepStrictEqual(yield* directory.listMembers(principal, organizationId), roster);
    }).pipe(Effect.provide(layer(memberships(role)))),
);

it.effect.each([
  {
    label: "unverified member",
    actor: { ...principal, emailVerified: false },
    id: organizationId,
    failure: new Access.Unverified({}),
  },
  {
    label: "outsider",
    actor: { ...principal, userId: UserId.make("outsider") },
    id: organizationId,
    failure: new Access.NotFound({}),
  },
  {
    label: "another organization",
    actor: principal,
    id: OrganizationId.make("other"),
    failure: new Access.NotFound({}),
  },
])("rejects $label at the core operation", ({ actor, id, failure }) =>
  Effect.gen(function* () {
    const directory = yield* OrganizationDirectory.Service;

    assert.deepStrictEqual(yield* Effect.flip(directory.listMembers(actor, id)), failure);
  }).pipe(Effect.provide(layer(memberships("member")))),
);

it.effect("preserves membership lookup failure instead of returning the available roster", () => {
  const failure = new OrganizationMembershipStore.Unavailable({ cause: "offline" });

  return Effect.gen(function* () {
    const directory = yield* OrganizationDirectory.Service;

    assert.strictEqual(
      yield* Effect.flip(directory.listMembers(principal, organizationId)),
      failure,
    );
  }).pipe(Effect.provide(layer({ ...memberships("member"), find: () => Effect.fail(failure) })));
});
