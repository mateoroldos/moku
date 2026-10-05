import { UserId } from "@moku/domain/identity";
import { Organization, OrganizationId, OrganizationRole } from "@moku/domain/organization";
import { Context, Effect, Option, Schema } from "effect";

export const Member = Schema.Struct({
  userId: UserId,
  organizationId: OrganizationId,
  role: OrganizationRole,
});
export interface Member extends Schema.Schema.Type<typeof Member> {}

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
  ) => Effect.Effect<Option.Option<Member>, Unavailable>;
  /** Requires Transaction.run; hold membership stable until the write commits. */
  readonly findForWrite: (
    userId: UserId,
    organizationId: OrganizationId,
  ) => Effect.Effect<Option.Option<Member>, Unavailable>;
  readonly list: (userId: UserId) => Effect.Effect<ReadonlyArray<Organization>, Unavailable>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@moku/core/OrganizationMembershipStore",
) {}

export * as OrganizationMembershipStore from "./organization-membership-store.ts";
