import { assert, it } from "@effect/vitest";
import { OrganizationMembershipStore } from "@moku/core/organization-membership-store";
import { UserId } from "@moku/domain/identity";
import { OrganizationId } from "@moku/domain/organization";
import { eq } from "drizzle-orm";
import { DateTime, Effect, Layer } from "effect";
import { member, user } from "../auth/schema.ts";
import { Database } from "../internal/database.ts";
import { PersistencePglite } from "../test/persistence-pglite.ts";
import { OrganizationMembershipStorePostgres } from "./organization-membership-store-postgres.ts";

const layer = OrganizationMembershipStorePostgres.layer.pipe(
  Layer.provideMerge(PersistencePglite.databaseLayer),
);

it.effect(
  "lists only the requested team's members with their identity, role, and stable order",
  () =>
    Effect.gen(function* () {
      const database = yield* Database.Service;
      const memberships = yield* OrganizationMembershipStore.Service;
      const createdAt = DateTime.toDateUtc(DateTime.makeUnsafe(0));

      yield* database.insert(user).values([
        { id: "0", name: "Zoe", email: "zoe@example.test" },
        { id: "b", name: "Alex", email: "alex-b@example.test" },
        { id: "a", name: "Alex", email: "alex-a@example.test" },
        { id: "other", name: "Other", email: "other@example.test" },
      ]);
      yield* database.insert(member).values([
        { id: "m-0", userId: "0", organizationId: "test-org", role: "member", createdAt },
        { id: "m-b", userId: "b", organizationId: "test-org", role: "viewer", createdAt },
        { id: "m-a", userId: "a", organizationId: "test-org", role: "owner", createdAt },
        { id: "m-other", userId: "other", organizationId: "other-org", role: "owner", createdAt },
        { id: "m-a-other", userId: "a", organizationId: "other-org", role: "admin", createdAt },
      ]);

      assert.deepStrictEqual(yield* memberships.listMembers(OrganizationId.make("test-org")), [
        { userId: UserId.make("a"), name: "Alex", email: "alex-a@example.test", role: "owner" },
        { userId: UserId.make("b"), name: "Alex", email: "alex-b@example.test", role: "viewer" },
        { userId: UserId.make("0"), name: "Zoe", email: "zoe@example.test", role: "member" },
      ]);
    }).pipe(Effect.provide(layer)),
  { timeout: 15000 },
);

it.effect(
  "fails the roster read when a stored member role is unknown",
  () =>
    Effect.gen(function* () {
      const database = yield* Database.Service;
      const memberships = yield* OrganizationMembershipStore.Service;

      yield* database
        .insert(user)
        .values({ id: "bad-role", name: "Alex", email: "bad@example.test" });
      yield* database.insert(member).values({
        id: "bad-role",
        userId: "bad-role",
        organizationId: "test-org",
        role: "owner",
        createdAt: DateTime.toDateUtc(DateTime.makeUnsafe(0)),
      });
      assert.lengthOf(yield* memberships.listMembers(OrganizationId.make("test-org")), 1);

      yield* database.update(member).set({ role: "unknown" }).where(eq(member.id, "bad-role"));

      const failure = yield* Effect.flip(memberships.listMembers(OrganizationId.make("test-org")));

      assert.strictEqual(failure._tag, "OrganizationMembershipStore.Unavailable");
    }).pipe(Effect.provide(layer)),
  { timeout: 15000 },
);
