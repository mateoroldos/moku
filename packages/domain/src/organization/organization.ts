import { Schema } from "effect";

export const OrganizationId = Schema.NonEmptyString.pipe(Schema.brand("OrganizationId"));
export type OrganizationId = typeof OrganizationId.Type;

export const OrganizationRole = Schema.Literals(["owner", "admin", "member", "viewer"]);
export type OrganizationRole = typeof OrganizationRole.Type;

export const Organization = Schema.Struct({ id: OrganizationId, name: Schema.NonEmptyString });
export interface Organization extends Schema.Schema.Type<typeof Organization> {}
