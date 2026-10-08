import type { Access } from "@moku/core/access";
import { UserId } from "@moku/domain/identity";
import {
  type Organization,
  type OrganizationId,
  OrganizationRole,
} from "@moku/domain/organization";
import { Context, type Effect, Schema } from "effect";

export const CreateInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty({ message: "Enter an organization name." })),
});
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

export const MemberSummary = Schema.Struct({
  userId: UserId,
  name: Schema.String,
  email: Schema.String,
  role: OrganizationRole,
});
export interface MemberSummary extends Schema.Schema.Type<typeof MemberSummary> {}

export class Unavailable extends Schema.TaggedError<Unavailable>()("Organizations.Unavailable", {
  cause: Schema.Redacted(Schema.Unknown),
}) {}

export interface Interface {
  /** The session owner's role; anyone who isn't a member gets `Access.NotFound`. */
  readonly role: (
    headers: Headers,
    organizationId: OrganizationId,
  ) => Effect.Effect<OrganizationRole, Access.NotFound | Unavailable>;
  readonly list: (headers: Headers) => Effect.Effect<ReadonlyArray<Organization>, Unavailable>;
  /** Members see the roster; anyone else gets `Access.NotFound`. */
  readonly listMembers: (
    headers: Headers,
    organizationId: OrganizationId,
  ) => Effect.Effect<ReadonlyArray<MemberSummary>, Access.NotFound | Unavailable>;
  /** Atomically create the organization and its owner membership. */
  readonly createWithOwner: (
    ownerUserId: UserId,
    input: CreateInput,
  ) => Effect.Effect<Organization, Unavailable>;
}

export class Service extends Context.Service<Service, Interface>()("@moku/web/Organizations") {}

export * as Organizations from "./organizations.ts";
