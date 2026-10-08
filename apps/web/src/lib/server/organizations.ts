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

// Better Auth 1.7.4's zod email check; looser input would surface as Unavailable.
const email =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

export const InviteInput = Schema.Struct({
  email: Schema.Trim.check(Schema.isPattern(email, { message: "Enter an email address." })),
  role: OrganizationRole,
});
export interface InviteInput extends Schema.Schema.Type<typeof InviteInput> {}

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

export class AlreadyMember extends Schema.TaggedError<AlreadyMember>()(
  "Organizations.AlreadyMember",
  {},
) {}

export interface Interface {
  /** The session owner's role; anyone who isn't a member gets `Access.NotFound`. */
  readonly role: (
    headers: Headers,
    organizationId: OrganizationId,
  ) => Effect.Effect<OrganizationRole, Access.NotFound | Unavailable>;
  readonly list: (headers: Headers) => Effect.Effect<ReadonlyArray<Organization>, Unavailable>;
  /** Members see the member list; anyone else gets `Access.NotFound`. */
  readonly listMembers: (
    headers: Headers,
    organizationId: OrganizationId,
  ) => Effect.Effect<ReadonlyArray<Member>, Access.NotFound | Unavailable>;
  /** Create an organization owned by the session owner. */
  readonly create: (
    headers: Headers,
    input: CreateInput,
  ) => Effect.Effect<Organization, Unavailable>;
  /** Owners and admins invite; inviting someone already invited resends their invitation. */
  readonly invite: (
    headers: Headers,
    organizationId: OrganizationId,
    input: InviteInput,
  ) => Effect.Effect<void, Access.NotFound | Access.Denied | AlreadyMember | Unavailable>;
}

export class Service extends Context.Service<Service, Interface>()("@moku/web/Organizations") {}

export * as Organizations from "./organizations.ts";
