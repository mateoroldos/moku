import type { Principal } from "@moku/domain/identity";
import type { Organization, OrganizationId } from "@moku/domain/organization";
import { Context, Effect, Layer } from "effect";
import { Access } from "../access/access.ts";
import { OrganizationAccess } from "./organization-access.ts";
import { OrganizationMembershipStore } from "./organization-membership-store.ts";
import { OrganizationCreation } from "./organization-creation.ts";

export const CreateInput = OrganizationCreation.Input;
export type CreateInput = OrganizationCreation.Input;

const allowedRoles = {
  listMembers: ["owner", "admin", "member", "viewer"],
} as const satisfies Record<"listMembers", Access.AllowedRoles>;

export interface Interface {
  readonly list: (
    principal: Principal,
  ) => Effect.Effect<
    ReadonlyArray<Organization>,
    Access.UnverifiedEmail | OrganizationMembershipStore.Unavailable
  >;
  readonly create: (
    principal: Principal,
    input: CreateInput,
  ) => Effect.Effect<Organization, Access.UnverifiedEmail | OrganizationCreation.Unavailable>;
  readonly listMembers: (
    principal: Principal,
    organizationId: OrganizationId,
  ) => Effect.Effect<
    ReadonlyArray<OrganizationMembershipStore.MemberSummary>,
    OrganizationAccess.Failure
  >;
}

export class Service extends Context.Service<Service, Interface>()("@moku/core/Organizations") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const memberships = yield* OrganizationMembershipStore.Service;
    const access = yield* OrganizationAccess.Service;
    const creation = yield* OrganizationCreation.Service;

    const list = Effect.fn("Organizations.list")(function* (principal: Principal) {
      yield* Access.requireVerifiedEmail(principal);

      return yield* memberships.listOrganizationsForUser(principal.userId);
    });

    const create = Effect.fn("Organizations.create")(function* (
      principal: Principal,
      input: CreateInput,
    ) {
      yield* Access.requireVerifiedEmail(principal);

      return yield* creation.createWithOwner(principal.userId, input);
    });

    const listMembers = Effect.fn("Organizations.listMembers")(function* (
      principal: Principal,
      organizationId: OrganizationId,
    ) {
      yield* access.require(principal, organizationId, allowedRoles.listMembers);

      return yield* memberships.listMembers(organizationId);
    });

    return Service.of({ list, create, listMembers });
  }),
).pipe(Layer.provide(OrganizationAccess.layer));

export * as Organizations from "./organizations.ts";
