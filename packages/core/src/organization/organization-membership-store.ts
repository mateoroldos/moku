import { UserId } from "@moku/domain/identity";
import { Organization, OrganizationId, OrganizationRole } from "@moku/domain/organization";
import { Context, Effect, Option, Schema } from "effect";
import type { Transaction } from "../transaction/transaction.ts";

export const Membership = Schema.Struct({
  userId: UserId,
  organizationId: OrganizationId,
  role: OrganizationRole,
});
export interface Membership extends Schema.Schema.Type<typeof Membership> {}

export const MemberSummary = Schema.Struct({
  userId: UserId,
  name: Schema.String,
  email: Schema.String,
  role: OrganizationRole,
});
export interface MemberSummary extends Schema.Schema.Type<typeof MemberSummary> {}

export class Unavailable extends Schema.TaggedError<Unavailable>()(
  "OrganizationMembershipStore.Unavailable",
  {
    cause: Schema.Defect(),
  },
) {}

export interface Interface {
  readonly find: (
    userId: UserId,
    organizationId: OrganizationId,
  ) => Effect.Effect<Option.Option<Membership>, Unavailable>;
  /** Requires Transaction.run; hold membership stable until the write commits. */
  readonly findForWrite: (
    userId: UserId,
    organizationId: OrganizationId,
  ) => Effect.Effect<Option.Option<Membership>, Unavailable, Transaction.Active>;
  readonly listOrganizationsForUser: (
    userId: UserId,
  ) => Effect.Effect<ReadonlyArray<Organization>, Unavailable>;
  readonly listMembers: (
    organizationId: OrganizationId,
  ) => Effect.Effect<ReadonlyArray<MemberSummary>, Unavailable>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@moku/core/OrganizationMembershipStore",
) {}

export * as OrganizationMembershipStore from "./organization-membership-store.ts";
