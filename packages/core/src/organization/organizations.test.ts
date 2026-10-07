import { assert, it } from "@effect/vitest";
import { UserId } from "@moku/domain/identity";
import { OrganizationId, type OrganizationRole } from "@moku/domain/organization";
import { Effect, Layer, Option, Redacted } from "effect";
import { Access } from "../access/access.ts";
import { OrganizationMembershipStore } from "./organization-membership-store.ts";
import { OrganizationCreation } from "./organization-creation.ts";
import { Organizations } from "./organizations.ts";

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
    listOrganizationsForUser: () => Effect.succeed([]),
    listMembers: (id) => Effect.succeed(id === organizationId ? roster : []),
  };
};
const layer = (
  store: OrganizationMembershipStore.Interface,
  creation: OrganizationCreation.Interface = {
    createWithOwner: () => Effect.die("Unexpected organization creation"),
  },
) =>
  Organizations.layer.pipe(
    Layer.provide(Layer.succeed(OrganizationMembershipStore.Service, store)),
    Layer.provide(Layer.succeed(OrganizationCreation.Service, creation)),
  );

it.effect.each(["owner", "admin", "member", "viewer"] as const)(
  "allows a verified %s to read their team's roster",
  (role) =>
    Effect.gen(function* () {
      const organizations = yield* Organizations.Service;

      assert.deepStrictEqual(yield* organizations.listMembers(principal, organizationId), roster);
    }).pipe(Effect.provide(layer(memberships(role)))),
);

it.effect.each([
  {
    label: "unverified member",
    actor: { ...principal, emailVerified: false },
    id: organizationId,
    failure: new Access.UnverifiedEmail({}),
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
    const organizations = yield* Organizations.Service;

    assert.deepStrictEqual(yield* Effect.flip(organizations.listMembers(actor, id)), failure);
  }).pipe(Effect.provide(layer(memberships("member")))),
);

it.effect("preserves membership lookup failure instead of returning the available roster", () => {
  const failure = new OrganizationMembershipStore.Unavailable({ cause: "offline" });

  return Effect.gen(function* () {
    const organizations = yield* Organizations.Service;

    assert.strictEqual(
      yield* Effect.flip(organizations.listMembers(principal, organizationId)),
      failure,
    );
  }).pipe(Effect.provide(layer({ ...memberships("member"), find: () => Effect.fail(failure) })));
});

it.effect("lists only the authenticated user's organizations", () => {
  const own = { id: organizationId, name: "Team" };
  const other = { id: OrganizationId.make("other"), name: "Other" };

  return Effect.gen(function* () {
    const organizations = yield* Organizations.Service;

    assert.deepStrictEqual(yield* organizations.list(principal), [own]);
  }).pipe(
    Effect.provide(
      layer({
        ...memberships("member"),
        listOrganizationsForUser: (userId) =>
          Effect.succeed(userId === principal.userId ? [own] : [other]),
      }),
    ),
  );
});

it.effect("derives the new organization's owner from the principal", () => {
  const created = { id: organizationId, name: "New team" };
  const owners: UserId[] = [];

  return Effect.gen(function* () {
    const organizations = yield* Organizations.Service;

    assert.deepStrictEqual(yield* organizations.create(principal, { name: created.name }), created);
    assert.deepStrictEqual(owners, [principal.userId]);
  }).pipe(
    Effect.provide(
      layer(memberships("member"), {
        createWithOwner: (ownerUserId, input) =>
          Effect.sync(() => {
            owners.push(ownerUserId);

            return { id: organizationId, name: input.name };
          }),
      }),
    ),
  );
});

it.effect("rejects unverified listing and creation before accessing either capability", () =>
  Effect.gen(function* () {
    const organizations = yield* Organizations.Service;
    const unverified = { ...principal, emailVerified: false };

    assert.deepStrictEqual(
      yield* Effect.flip(organizations.list(unverified)),
      new Access.UnverifiedEmail({}),
    );
    assert.deepStrictEqual(
      yield* Effect.flip(organizations.create(unverified, { name: "Team" })),
      new Access.UnverifiedEmail({}),
    );
  }).pipe(
    Effect.provide(
      layer({
        ...memberships("member"),
        listOrganizationsForUser: () => Effect.die("Unexpected organization listing"),
      }),
    ),
  ),
);

it.effect("preserves organization listing and creation failures", () => {
  const listingFailure = new OrganizationMembershipStore.Unavailable({ cause: "offline" });
  const creationFailure = new OrganizationCreation.Unavailable({ cause: Redacted.make("offline") });

  return Effect.gen(function* () {
    const organizations = yield* Organizations.Service;

    assert.strictEqual(yield* Effect.flip(organizations.list(principal)), listingFailure);
    assert.strictEqual(
      yield* Effect.flip(organizations.create(principal, { name: "Team" })),
      creationFailure,
    );
  }).pipe(
    Effect.provide(
      layer(
        {
          ...memberships("member"),
          listOrganizationsForUser: () => Effect.fail(listingFailure),
        },
        {
          createWithOwner: () => Effect.fail(creationFailure),
        },
      ),
    ),
  );
});
