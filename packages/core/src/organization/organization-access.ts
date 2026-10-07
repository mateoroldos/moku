import type { Principal } from "@moku/domain/identity";
import type { OrganizationId } from "@moku/domain/organization";
import { Context, Effect, Layer, Option } from "effect";
import { Access } from "../access/access.ts";
import type { Transaction } from "../transaction/transaction.ts";
import { OrganizationMembershipStore } from "./organization-membership-store.ts";

export type Failure =
  | Access.UnverifiedEmail
  | Access.NotFound
  | Access.Denied
  | OrganizationMembershipStore.Unavailable;

export interface Interface {
  readonly require: (
    principal: Principal,
    organizationId: OrganizationId,
    allowedRoles: Access.AllowedRoles,
  ) => Effect.Effect<OrganizationMembershipStore.Membership, Failure>;

  /** The caller owns the transaction containing this check and the mutation. */
  readonly requireForWrite: (
    principal: Principal,
    organizationId: OrganizationId,
    allowedRoles: Access.AllowedRoles,
  ) => Effect.Effect<OrganizationMembershipStore.Membership, Failure, Transaction.Active>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@moku/core/OrganizationAccess",
) {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const memberships = yield* OrganizationMembershipStore.Service;

    const check = Effect.fnUntraced(function* <R>(
      principal: Principal,
      allowedRoles: Access.AllowedRoles,
      lookupMembership: Effect.Effect<
        Option.Option<OrganizationMembershipStore.Membership>,
        OrganizationMembershipStore.Unavailable,
        R
      >,
    ) {
      yield* Access.requireVerifiedEmail(principal);

      const membership = yield* lookupMembership;
      if (Option.isNone(membership)) return yield* new Access.NotFound({});
      if (!Access.allows(allowedRoles, membership.value.role)) return yield* new Access.Denied({});

      return membership.value;
    });

    const require = Effect.fn("OrganizationAccess.require")(
      (principal: Principal, organizationId: OrganizationId, allowedRoles: Access.AllowedRoles) =>
        check(principal, allowedRoles, memberships.find(principal.userId, organizationId)),
    );

    const requireForWrite = Effect.fn("OrganizationAccess.requireForWrite")(
      (principal: Principal, organizationId: OrganizationId, allowedRoles: Access.AllowedRoles) =>
        check(principal, allowedRoles, memberships.findForWrite(principal.userId, organizationId)),
    );

    return Service.of({ require, requireForWrite });
  }),
);

export * as OrganizationAccess from "./organization-access.ts";
