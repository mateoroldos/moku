import type { Principal } from "@moku/domain/identity";
import type { OrganizationRole } from "@moku/domain/organization";
import { Effect, Schema } from "effect";

export class Unverified extends Schema.TaggedError<Unverified>()("Access.Unverified", {}) {}
export class NotFound extends Schema.TaggedError<NotFound>()("Access.NotFound", {}) {}
export class Denied extends Schema.TaggedError<Denied>()("Access.Denied", {}) {}

export const requireVerified = (principal: Principal) =>
  principal.emailVerified ? Effect.succeed(principal) : Effect.fail(new Unverified({}));

export type Permission = ReadonlyArray<OrganizationRole>;

export const allows = (permission: Permission, role: OrganizationRole) => permission.includes(role);

export * as Access from "./access.ts";
