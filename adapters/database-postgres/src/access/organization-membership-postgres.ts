import { OrganizationMembership } from "@moku/core/organization-membership";
import type { UserId } from "@moku/domain/identity";
import { Organization, type OrganizationId } from "@moku/domain/organization";
import { and, asc, eq } from "drizzle-orm";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { member, organization } from "../auth/schema.ts";
import { Database } from "../internal/database.ts";

export const layer = Layer.effect(
  OrganizationMembership.Service,
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
        : Option.some(yield* Schema.decodeUnknownEffect(OrganizationMembership.Member)(row));
    });
    const unavailable = (cause: unknown) => new OrganizationMembership.Unavailable({ cause });
    const find = Effect.fn("OrganizationMembershipPostgres.find")(
      (userId: UserId, organizationId: OrganizationId) =>
        lookup(userId, organizationId).pipe(Effect.flatMap(decode), Effect.mapError(unavailable)),
    );
    const findForWrite = Effect.fn("OrganizationMembershipPostgres.findForWrite")(function* (
      userId: UserId,
      organizationId: OrganizationId,
    ) {
      if (Option.isNone(yield* Effect.serviceOption(sql.transactionService))) {
        return yield* Effect.die(
          new Error("OrganizationMembership.findForWrite requires Transaction.run"),
        );
      }
      return yield* lookup(userId, organizationId)
        .for("share")
        .pipe(Effect.flatMap(decode), Effect.mapError(unavailable));
    });
    const list = Effect.fn("OrganizationMembershipPostgres.list")((userId: UserId) =>
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
    return OrganizationMembership.Service.of({ find, findForWrite, list });
  }),
);

export * as OrganizationMembershipPostgres from "./organization-membership-postgres.ts";
