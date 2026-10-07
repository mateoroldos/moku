import type { Principal } from "@moku/domain/identity";
import type { OrganizationId } from "@moku/domain/organization";
import { Context, Effect, Layer } from "effect";
import type { Access } from "../access/access.ts";
import { OrganizationAccess } from "../access/organization-access.ts";
import { OrganizationMembershipStore } from "../access/organization-membership-store.ts";

const permissions = {
  listMembers: ["owner", "admin", "member", "viewer"],
} as const satisfies Record<"listMembers", Access.Permission>;

export interface Interface {
  readonly listMembers: (
    principal: Principal,
    organizationId: OrganizationId,
  ) => Effect.Effect<
    ReadonlyArray<OrganizationMembershipStore.MemberSummary>,
    OrganizationAccess.Failure
  >;
}

export class Service extends Context.Service<Service, Interface>()(
  "@moku/core/OrganizationDirectory",
) {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const memberships = yield* OrganizationMembershipStore.Service;
    const access = yield* OrganizationAccess.Service;

    const listMembers = Effect.fn("OrganizationDirectory.listMembers")(function* (
      principal: Principal,
      organizationId: OrganizationId,
    ) {
      yield* access.require(principal, organizationId, permissions.listMembers);

      return yield* memberships.listMembers(organizationId);
    });

    return Service.of({ listMembers });
  }),
).pipe(Layer.provide(OrganizationAccess.layer));

export * as OrganizationDirectory from "./organization-directory.ts";
