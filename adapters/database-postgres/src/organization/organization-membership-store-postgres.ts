import { OrganizationMembershipStore } from "@moku/core/organization-membership-store";
import type { UserId } from "@moku/domain/identity";
import { Organization, type OrganizationId } from "@moku/domain/organization";
import { and, asc, eq } from "drizzle-orm";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import { member, organization, user } from "../auth/schema.ts";
import { Database } from "../internal/database.ts";

export const layer = Layer.effect(
  OrganizationMembershipStore.Service,
  Effect.gen(function* () {
    const database = yield* Database.Service;
    const sql = yield* SqlClient.SqlClient;

    const lookup = (userId: UserId, organizationId: OrganizationId) =>
      database
        .select({
          userId: member.userId,
          organizationId: member.organizationId,
          role: member.role,
        })
        .from(member)
        .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)));
    const decode = Effect.fnUntraced(function* (rows: ReadonlyArray<unknown>) {
      const row = rows[0];
      return row === undefined
        ? Option.none()
        : Option.some(
            yield* Schema.decodeUnknownEffect(OrganizationMembershipStore.Membership)(row),
          );
    });
    const unavailable = (cause: unknown) => new OrganizationMembershipStore.Unavailable({ cause });

    const find = Effect.fn("OrganizationMembershipStorePostgres.find")(
      (userId: UserId, organizationId: OrganizationId) =>
        lookup(userId, organizationId).pipe(Effect.flatMap(decode), Effect.mapError(unavailable)),
    );

    const withLock = Effect.fn("OrganizationMembershipStorePostgres.withLock")(function* <A, E, R>(
      userId: UserId,
      organizationId: OrganizationId,
      use: (
        membership: Option.Option<OrganizationMembershipStore.Membership>,
      ) => Effect.Effect<A, E, R>,
    ) {
      return yield* sql
        .withTransaction(
          Effect.gen(function* () {
            const membership = yield* lookup(userId, organizationId)
              .for("share")
              .pipe(Effect.flatMap(decode), Effect.mapError(unavailable));

            return yield* use(membership);
          }),
        )
        .pipe(
          Effect.mapError((cause) => (SqlError.isSqlError(cause) ? unavailable(cause) : cause)),
        );
    });

    const listOrganizationsForUser = Effect.fn(
      "OrganizationMembershipStorePostgres.listOrganizationsForUser",
    )((userId: UserId) =>
      database
        .select({ id: organization.id, name: organization.name })
        .from(organization)
        .innerJoin(member, eq(member.organizationId, organization.id))
        .where(eq(member.userId, userId))
        .orderBy(asc(organization.id))
        .pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Organization))),
          Effect.mapError(unavailable),
        ),
    );

    const listMembers = Effect.fn("OrganizationMembershipStorePostgres.listMembers")(
      (organizationId: OrganizationId) =>
        database
          .select({ userId: user.id, name: user.name, email: user.email, role: member.role })
          .from(member)
          .innerJoin(user, eq(member.userId, user.id))
          .where(eq(member.organizationId, organizationId))
          .orderBy(asc(user.name), asc(user.id))
          .pipe(
            Effect.flatMap(
              Schema.decodeUnknownEffect(Schema.Array(OrganizationMembershipStore.MemberSummary)),
            ),
            Effect.mapError(unavailable),
          ),
    );

    return OrganizationMembershipStore.Service.of({
      find,
      withLock,
      listOrganizationsForUser,
      listMembers,
    });
  }),
);

export * as OrganizationMembershipStorePostgres from "./organization-membership-store-postgres.ts";
