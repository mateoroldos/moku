import type { Principal } from "@moku/domain/identity";
import type { OrganizationId } from "@moku/domain/organization";
import { Context, Effect, Layer, Option } from "effect";
import { Access } from "./access.ts";
import { OrganizationMembership } from "./organization-membership.ts";

export type Failure =
  | Access.Unverified
  | Access.NotFound
  | Access.Denied
  | OrganizationMembership.Unavailable;

export interface Interface {
  readonly require: (
    principal: Principal,
    organizationId: OrganizationId,
    permission: Access.Permission,
  ) => Effect.Effect<OrganizationMembership.Member, Failure>;
  /** The caller owns the transaction containing this check and the mutation. */
  readonly requireForWrite: Interface["require"];
}

export class Service extends Context.Service<Service, Interface>()(
  "@moku/core/OrganizationAccess",
) {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const memberships = yield* OrganizationMembership.Service;

    const check = Effect.fnUntraced(function* (
      principal: Principal,
      permission: Access.Permission,
      lookup: ReturnType<typeof memberships.find>,
    ) {
      yield* Access.requireVerified(principal);
      const member = yield* lookup;
      if (Option.isNone(member)) return yield* new Access.NotFound({});
      if (!Access.allows(permission, member.value.role)) return yield* new Access.Denied({});
      return member.value;
    });

    const require = Effect.fn("OrganizationAccess.require")(
      (principal: Principal, organizationId: OrganizationId, permission: Access.Permission) =>
        check(principal, permission, memberships.find(principal.userId, organizationId)),
    );

    const requireForWrite = Effect.fn("OrganizationAccess.requireForWrite")(
      (principal: Principal, organizationId: OrganizationId, permission: Access.Permission) =>
        check(principal, permission, memberships.findForWrite(principal.userId, organizationId)),
    );

    return Service.of({ require, requireForWrite });
  }),
);

export * as OrganizationAccess from "./organization-access.ts";
