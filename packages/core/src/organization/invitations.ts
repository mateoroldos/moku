import type { Principal } from "@moku/domain/identity";
import { Membership, OrganizationId, OrganizationRole } from "@moku/domain/organization";
import { Effect, Schema } from "effect";
import { Access } from "../access/access.ts";
import { OrganizationAccess } from "./organization-access.ts";

export const InvitationId = Schema.NonEmptyString.pipe(Schema.brand("InvitationId"));
export type InvitationId = typeof InvitationId.Type;

export const CreateInput = Schema.Struct({
  organizationId: OrganizationId,
  email: Schema.Trim.check(Schema.isNonEmpty()),
  role: OrganizationRole,
  resend: Schema.Boolean,
});
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

export class Rejected extends Schema.TaggedError<Rejected>()("Invitations.Rejected", {
  reason: Schema.Literals([
    "InvalidEmail",
    "AlreadyInvited",
    "AlreadyMember",
    "InvalidInvitation",
    "WrongRecipient",
    "Denied",
    "SessionRequired",
    "UnverifiedEmail",
    "LimitReached",
  ]),
}) {}

export class Unavailable extends Schema.TaggedError<Unavailable>()("Invitations.Unavailable", {
  cause: Schema.Redacted(Schema.Unknown),
}) {}

/** A request-bound capability; identity and invitation operations share the same credentials. */
export interface Session {
  readonly principal: Principal;
  readonly create: (input: CreateInput) => Effect.Effect<InvitationId, Rejected | Unavailable>;
  readonly accept: (id: InvitationId) => Effect.Effect<Membership, Rejected | Unavailable>;
}

export const create = Effect.fn("Invitations.create")(function* (
  session: Session,
  input: CreateInput,
) {
  const access = yield* OrganizationAccess.Service;
  const membership = yield* access.require(session.principal, input.organizationId, [
    "owner",
    "admin",
  ]);
  if (input.role === "owner" && membership.role !== "owner") return yield* new Access.Denied({});

  return yield* session.create(input);
});

export const accept = Effect.fn("Invitations.accept")(function* (
  session: Session,
  id: InvitationId,
) {
  yield* Access.requireVerifiedEmail(session.principal);

  return yield* session.accept(id);
});

export * as Invitations from "./invitations.ts";
