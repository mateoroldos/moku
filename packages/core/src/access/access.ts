import type { Principal } from "@moku/domain/identity";
import type { OrganizationRole } from "@moku/domain/organization";
import { Effect, Schema } from "effect";

export class UnverifiedEmail extends Schema.TaggedError<UnverifiedEmail>()(
  "Access.UnverifiedEmail",
  {},
) {}
export class NotFound extends Schema.TaggedError<NotFound>()("Access.NotFound", {}) {}
export class Denied extends Schema.TaggedError<Denied>()("Access.Denied", {}) {}

export const requireVerifiedEmail = (principal: Principal) =>
  principal.emailVerified ? Effect.succeed(principal) : Effect.fail(new UnverifiedEmail({}));

export type AllowedRoles = ReadonlyArray<OrganizationRole>;

export const allows = (allowedRoles: AllowedRoles, role: OrganizationRole) =>
  allowedRoles.includes(role);

export const requireRole = (allowedRoles: AllowedRoles, role: OrganizationRole) =>
  allows(allowedRoles, role) ? Effect.void : Effect.fail(new Denied({}));

export * as Access from "./access.ts";
