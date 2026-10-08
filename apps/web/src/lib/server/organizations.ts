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

export const Member = Schema.Struct({
  userId: UserId,
  name: Schema.String,
  email: Schema.String,
  role: OrganizationRole,
});
export interface Member extends Schema.Schema.Type<typeof Member> {}

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
  ) => Effect.Effect<ReadonlyArray<Member>, Access.NotFound | Unavailable>;
  /** Create an organization owned by the session owner. */
  readonly create: (
    headers: Headers,
    input: CreateInput,
  ) => Effect.Effect<Organization, Unavailable>;
}

export class Service extends Context.Service<Service, Interface>()("@moku/web/Organizations") {}

export * as Organizations from "./organizations.ts";
