import { form, getRequestEvent, query } from "$app/server";
import { Access } from "@moku/core/access";
import { Organization, OrganizationId, OrganizationRole } from "@moku/domain/organization";
import { error, invalid, redirect } from "@sveltejs/kit";
import { Effect, Match, Result, Schema } from "effect";
import { AuthGuard } from "#lib/server/auth-guard.ts";
import { Organizations } from "#lib/server/organizations.ts";

export const listOrganizationMembers = query(
  Schema.toStandardSchemaV1(OrganizationId),
  (organizationId) => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.listOrganizationMembers",
        Effect.gen(function* () {
          yield* event.locals.auth.principal;
          const organizations = yield* Organizations.Service;

          return yield* organizations.listMembers(event.request.headers, organizationId);
        }),
      )
      .then(
        Result.match({
          onSuccess: Schema.encodeSync(Schema.Array(Organizations.Member)),
          onFailure: (failure) =>
            Match.valueTags(failure, {
              "AuthGuard.Required": AuthGuard.reject,
              "Access.UnverifiedEmail": AuthGuard.reject,
              "AuthProvider.Unavailable": AuthGuard.reject,
              "Access.NotFound": () => error(404, "This organization could not be found."),
              "Organizations.Unavailable": () =>
                error(503, "We couldn’t load your team. Try again."),
            }),
        }),
      );
  },
);

export const createOrganization = form(
  Schema.toStandardSchemaV1(Organizations.CreateInput, {
    parseOptions: { onExcessProperty: "error" },
  }),
  ({ name }) => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.createOrganization",
        Effect.gen(function* () {
          yield* event.locals.auth.principal;
          const organizations = yield* Organizations.Service;

          return yield* organizations.create(event.request.headers, { name });
        }),
      )
      .then(
        Result.match({
          onSuccess: (organization) => redirect(303, `/org/${encodeURIComponent(organization.id)}`),
          onFailure: (failure) =>
            Match.valueTags(failure, {
              "AuthGuard.Required": AuthGuard.reject,
              "Access.UnverifiedEmail": AuthGuard.reject,
              "AuthProvider.Unavailable": AuthGuard.reject,
              "Organizations.Unavailable": () =>
                error(
                  503,
                  "We couldn’t confirm creation. Check your organizations before trying again.",
                ),
            }),
        }),
      );
  },
);

export const listInvitations = query(
  Schema.toStandardSchemaV1(OrganizationId),
  (organizationId) => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.listInvitations",
        Effect.gen(function* () {
          yield* event.locals.auth.principal;
          const organizations = yield* Organizations.Service;

          return yield* organizations.listInvitations(event.request.headers, organizationId);
        }),
      )
      .then(
        Result.match({
          onSuccess: Schema.encodeSync(Schema.Array(Organizations.PendingInvitation)),
          onFailure: (failure) =>
            Match.valueTags(failure, {
              "AuthGuard.Required": AuthGuard.reject,
              "Access.UnverifiedEmail": AuthGuard.reject,
              "AuthProvider.Unavailable": AuthGuard.reject,
              "Access.NotFound": () => error(404, "This organization could not be found."),
              "Organizations.Unavailable": () =>
                error(503, "We couldn’t load pending invitations. Try again."),
            }),
        }),
      );
  },
);

export const inviteTeammate = form(
  Schema.toStandardSchemaV1(
    Schema.Struct({ organizationId: OrganizationId, ...Organizations.InviteInput.fields }),
    { parseOptions: { onExcessProperty: "error" } },
  ),
  ({ organizationId, ...input }, issue) => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.inviteTeammate",
        Effect.gen(function* () {
          yield* event.locals.auth.principal;
          const organizations = yield* Organizations.Service;

          return yield* organizations.invite(event.request.headers, organizationId, input);
        }),
      )
      .then(
        Result.match({
          onSuccess: () => ({ invited: input.email }),
          onFailure: (failure) =>
            Match.valueTags(failure, {
              "AuthGuard.Required": AuthGuard.reject,
              "Access.UnverifiedEmail": AuthGuard.reject,
              "AuthProvider.Unavailable": AuthGuard.reject,
              "Access.NotFound": () => error(404, "This organization could not be found."),
              "Access.Denied": () => error(403, "Your role can’t send invitations."),
              "Organizations.AlreadyMember": () =>
                invalid(issue.email(`${input.email} is already a member.`)),
              "Organizations.RoleNotAllowed": () =>
                invalid(issue.role(`You can’t invite someone as ${input.role}.`)),
              "Organizations.InvitationLimit": () =>
                invalid("This organization has too many pending invitations. Cancel some first."),
              "Organizations.Unavailable": () =>
                error(503, "We couldn’t confirm the invitation. Check pending invitations first."),
            }),
        }),
      );
  },
);

export const cancelInvitation = form(
  Schema.toStandardSchemaV1(
    // `cancelInvitation.for(id)` fills `id`.
    Schema.Struct({ id: Schema.NonEmptyString }),
    { parseOptions: { onExcessProperty: "error" } },
  ),
  ({ id }) => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.cancelInvitation",
        Effect.gen(function* () {
          yield* event.locals.auth.principal;
          const organizations = yield* Organizations.Service;

          return yield* organizations.cancelInvitation(event.request.headers, id);
        }),
      )
      .then(
        Result.match({
          onSuccess: () => ({ cancelled: true }),
          onFailure: (failure) =>
            Match.valueTags(failure, {
              "AuthGuard.Required": AuthGuard.reject,
              "Access.UnverifiedEmail": AuthGuard.reject,
              "AuthProvider.Unavailable": AuthGuard.reject,
              "Access.NotFound": () => error(404, "This organization could not be found."),
              "Access.Denied": () => error(403, "Your role can’t cancel invitations."),
              // Already accepted, cancelled, or expired: the refreshed list shows it gone.
              "Organizations.InvitationInvalid": () => ({ cancelled: true }),
              "Organizations.Unavailable": () =>
                error(503, "We couldn’t confirm the cancellation. Try again."),
            }),
        }),
      );
  },
);

export const changeMemberRole = form(
  Schema.toStandardSchemaV1(
    // `changeMemberRole.for(memberId)` fills `id`.
    Schema.Struct({
      id: Schema.NonEmptyString,
      organizationId: OrganizationId,
      role: OrganizationRole,
    }),
    { parseOptions: { onExcessProperty: "error" } },
  ),
  ({ id, organizationId, role }) => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.changeMemberRole",
        Effect.gen(function* () {
          yield* event.locals.auth.principal;
          const organizations = yield* Organizations.Service;

          return yield* organizations.changeRole(event.request.headers, organizationId, id, role);
        }),
      )
      .then(
        Result.getOrElse((failure) =>
          Match.valueTags(failure, {
            "AuthGuard.Required": AuthGuard.reject,
            "Access.UnverifiedEmail": AuthGuard.reject,
            "AuthProvider.Unavailable": AuthGuard.reject,
            // The refreshed list shows the member gone.
            "Organizations.MemberNotFound": () => undefined,
            "Organizations.RoleNotAllowed": () => invalid("You can’t change this member’s role."),
            "Organizations.LastOwner": () => invalid("Make someone else an owner first."),
            "Organizations.Unavailable": () =>
              error(503, "We couldn’t confirm the role change. Try again."),
          }),
        ),
      );
  },
);

export const removeMember = form(
  Schema.toStandardSchemaV1(
    // `removeMember.for(memberId)` fills `id`.
    Schema.Struct({ id: Schema.NonEmptyString, organizationId: OrganizationId }),
    { parseOptions: { onExcessProperty: "error" } },
  ),
  ({ id, organizationId }) => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.removeMember",
        Effect.gen(function* () {
          yield* event.locals.auth.principal;
          const organizations = yield* Organizations.Service;

          return yield* organizations.removeMember(event.request.headers, organizationId, id);
        }),
      )
      .then(
        Result.match({
          onSuccess: () => ({ removed: true }),
          onFailure: (failure) =>
            Match.valueTags(failure, {
              "AuthGuard.Required": AuthGuard.reject,
              "Access.UnverifiedEmail": AuthGuard.reject,
              "AuthProvider.Unavailable": AuthGuard.reject,
              // Already gone is what the caller asked for.
              "Organizations.MemberNotFound": () => ({ removed: true }),
              "Organizations.RemovalNotAllowed": () => invalid("You can’t remove this member."),
              "Organizations.Unavailable": () =>
                error(503, "We couldn’t confirm the removal. Try again."),
            }),
        }),
      );
  },
);

export const getOrganization = query(
  Schema.toStandardSchemaV1(OrganizationId),
  (organizationId) => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.getOrganization",
        Effect.gen(function* () {
          yield* event.locals.auth.principal;
          const organizations = yield* Organizations.Service;
          const organization = (yield* organizations.list(event.request.headers)).find(
            ({ id }) => id === organizationId,
          );

          return organization ?? (yield* new Access.NotFound({}));
        }),
      )
      .then(
        Result.match({
          onSuccess: Schema.encodeSync(Organization),
          onFailure: (failure) =>
            Match.valueTags(failure, {
              "AuthGuard.Required": AuthGuard.reject,
              "Access.UnverifiedEmail": AuthGuard.reject,
              "AuthProvider.Unavailable": AuthGuard.reject,
              "Access.NotFound": () => error(404, "This organization could not be found."),
              "Organizations.Unavailable": () =>
                error(503, "We couldn’t load this organization. Try again."),
            }),
        }),
      );
  },
);

export const deleteOrganization = form(
  Schema.toStandardSchemaV1(
    Schema.Struct({ organizationId: OrganizationId, confirmation: Schema.String }),
    { parseOptions: { onExcessProperty: "error" } },
  ),
  ({ organizationId, confirmation }, issue) => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.deleteOrganization",
        Effect.gen(function* () {
          yield* event.locals.auth.principal;
          const organizations = yield* Organizations.Service;
          const organization = (yield* organizations.list(event.request.headers)).find(
            ({ id }) => id === organizationId,
          );

          // Deleted already, or never a member: what the caller asked for.
          if (organization === undefined) return "deleted";
          if (organization.name !== confirmation) return "unconfirmed";

          yield* organizations.delete(event.request.headers, organizationId);
          return "deleted";
        }),
      )
      .then(
        Result.match({
          onSuccess: (outcome) =>
            outcome === "deleted"
              ? redirect(303, "/")
              : invalid(issue.confirmation("Type the organization’s name exactly.")),
          onFailure: (failure) =>
            Match.valueTags(failure, {
              "AuthGuard.Required": AuthGuard.reject,
              "Access.UnverifiedEmail": AuthGuard.reject,
              "AuthProvider.Unavailable": AuthGuard.reject,
              "Access.NotFound": () => redirect(303, "/"),
              "Access.Denied": () => invalid("Only owners can delete this organization."),
              "Organizations.Unavailable": () =>
                error(
                  503,
                  "We couldn’t confirm the deletion. Check your organizations before trying again.",
                ),
            }),
        }),
      );
  },
);
