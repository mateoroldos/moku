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

export const Invitation = Schema.Struct({
  email: Schema.String,
  organizationName: Schema.String,
  inviterEmail: Schema.String,
  role: OrganizationRole,
});
export interface Invitation extends Schema.Schema.Type<typeof Invitation> {}

export const PendingInvitation = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  role: OrganizationRole,
});
export interface PendingInvitation extends Schema.Schema.Type<typeof PendingInvitation> {}

/** Expired, cancelled, already accepted, unknown, or sent to another email. */
export class InvitationInvalid extends Schema.TaggedError<InvitationInvalid>()(
  "Organizations.InvitationInvalid",
  {},
) {}

/** Better Auth's cap on pending invitations per organization. */
export class InvitationLimit extends Schema.TaggedError<InvitationLimit>()(
  "Organizations.InvitationLimit",
  {},
) {}

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
  ) => Effect.Effect<
    void,
    Access.NotFound | Access.Denied | AlreadyMember | InvitationLimit | Unavailable
  >;
  /** Pending, unexpired invitations, by email; members see them, anyone else gets `Access.NotFound`. */
  readonly listInvitations: (
    headers: Headers,
    organizationId: OrganizationId,
  ) => Effect.Effect<ReadonlyArray<PendingInvitation>, Access.NotFound | Unavailable>;
  /** Owners and admins cancel. */
  readonly cancelInvitation: (
    headers: Headers,
    invitationId: string,
  ) => Effect.Effect<void, Access.NotFound | Access.Denied | InvitationInvalid | Unavailable>;
  /** The session owner's pending invitation. */
  readonly getInvitation: (
    headers: Headers,
    invitationId: string,
  ) => Effect.Effect<Invitation, InvitationInvalid | Unavailable>;
  /** Join with the invited role; returns the organization joined. */
  readonly acceptInvitation: (
    headers: Headers,
    invitationId: string,
  ) => Effect.Effect<OrganizationId, InvitationInvalid | Unavailable>;
}

export class Service extends Context.Service<Service, Interface>()("@moku/web/Organizations") {}

export * as Organizations from "./organizations.ts";
