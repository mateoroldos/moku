import { Schema } from "effect";
import { UserId } from "../identity/identity.ts";

export const OrganizationId = Schema.NonEmptyString.pipe(Schema.brand("OrganizationId"));
export type OrganizationId = typeof OrganizationId.Type;

export const OrganizationRole = Schema.Literals(["owner", "admin", "member", "viewer"]);
export type OrganizationRole = typeof OrganizationRole.Type;

export const Organization = Schema.Struct({ id: OrganizationId, name: Schema.NonEmptyString });
export interface Organization extends Schema.Schema.Type<typeof Organization> {}

export const Membership = Schema.Struct({
  userId: UserId,
  organizationId: OrganizationId,
  role: OrganizationRole,
});
export interface Membership extends Schema.Schema.Type<typeof Membership> {}
