import type { Principal } from "@moku/domain/identity";
import type { OrganizationId } from "@moku/domain/organization";
import { Context, Effect, Layer, Option } from "effect";
import { Access } from "../access/access.ts";
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

  /** Authorize and run the write while membership stays stable through commit. */
  readonly withWriteAccess: <A, E, R>(
    principal: Principal,
    organizationId: OrganizationId,
    allowedRoles: Access.AllowedRoles,
    use: (membership: OrganizationMembershipStore.Membership) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | Failure, R>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@moku/core/OrganizationAccess",
) {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const memberships = yield* OrganizationMembershipStore.Service;

    const check = Effect.fnUntraced(function* (
      allowedRoles: Access.AllowedRoles,
      membership: Option.Option<OrganizationMembershipStore.Membership>,
    ) {
      if (Option.isNone(membership)) return yield* new Access.NotFound({});
      if (!Access.allows(allowedRoles, membership.value.role)) return yield* new Access.Denied({});

      return membership.value;
    });

    const require = Effect.fn("OrganizationAccess.require")(function* (
      principal: Principal,
      organizationId: OrganizationId,
      allowedRoles: Access.AllowedRoles,
    ) {
      yield* Access.requireVerifiedEmail(principal);

      const membership = yield* memberships.find(principal.userId, organizationId);

      return yield* check(allowedRoles, membership);
    });

    const withWriteAccess = Effect.fn("OrganizationAccess.withWriteAccess")(function* <A, E, R>(
      principal: Principal,
      organizationId: OrganizationId,
      allowedRoles: Access.AllowedRoles,
      use: (membership: OrganizationMembershipStore.Membership) => Effect.Effect<A, E, R>,
    ) {
      yield* Access.requireVerifiedEmail(principal);

      return yield* memberships.withLock(principal.userId, organizationId, (membership) =>
        check(allowedRoles, membership).pipe(Effect.flatMap(use)),
      );
    });

    return Service.of({ require, withWriteAccess });
  }),
);

export * as OrganizationAccess from "./organization-access.ts";
