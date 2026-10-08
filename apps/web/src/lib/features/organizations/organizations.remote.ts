import { form, getRequestEvent, query } from "$app/server";
import { OrganizationId, OrganizationRole } from "@moku/domain/organization";
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
        Result.getOrElse((failure) =>
          Match.valueTags(failure, {
            "AuthGuard.Required": AuthGuard.reject,
            "Access.UnverifiedEmail": AuthGuard.reject,
            "AuthProvider.Unavailable": AuthGuard.reject,
            "Access.NotFound": () => error(404, "This organization could not be found."),
            "Organizations.Unavailable": () => error(503, "We couldn’t load your team. Try again."),
          }),
        ),
      )
      .then(Schema.encodeSync(Schema.Array(Organizations.Member)));
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
        Result.getOrElse((failure) =>
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
        ),
      )
      .then((organization) => redirect(303, `/org/${encodeURIComponent(organization.id)}`));
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
        Result.getOrElse((failure) =>
          Match.valueTags(failure, {
            "AuthGuard.Required": AuthGuard.reject,
            "Access.UnverifiedEmail": AuthGuard.reject,
            "AuthProvider.Unavailable": AuthGuard.reject,
            "Access.NotFound": () => error(404, "This organization could not be found."),
            "Organizations.Unavailable": () =>
              error(503, "We couldn’t load pending invitations. Try again."),
          }),
        ),
      )
      .then(Schema.encodeSync(Schema.Array(Organizations.PendingInvitation)));
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

          return yield* organizations.invite(event.request.headers, organizationId, input).pipe(
            Effect.as({ _tag: "Invited" } as const),
            // Correctable rejections are handled outcomes, not operation failures.
            Effect.catchTags({
              "Organizations.AlreadyMember": (rejection) => Effect.succeed(rejection),
              "Organizations.RoleNotAllowed": (rejection) => Effect.succeed(rejection),
              "Organizations.InvitationLimit": (rejection) => Effect.succeed(rejection),
            }),
          );
        }),
      )
      .then(
        Result.getOrElse((failure) =>
          Match.valueTags(failure, {
            "AuthGuard.Required": AuthGuard.reject,
            "Access.UnverifiedEmail": AuthGuard.reject,
            "AuthProvider.Unavailable": AuthGuard.reject,
            "Access.NotFound": () => error(404, "This organization could not be found."),
            "Access.Denied": () => error(403, "Your role can’t send invitations."),
            "Organizations.Unavailable": () =>
              error(503, "We couldn’t confirm the invitation. Check pending invitations first."),
          }),
        ),
      )
      .then((outcome) =>
        Match.valueTags(outcome, {
          Invited: () => ({ invited: input.email }),
          "Organizations.AlreadyMember": () =>
            invalid(issue.email(`${input.email} is already a member.`)),
          "Organizations.RoleNotAllowed": () =>
            invalid(issue.role(`You can’t invite someone as ${input.role}.`)),
          "Organizations.InvitationLimit": () =>
            invalid("This organization has too many pending invitations. Cancel some first."),
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

          return yield* organizations.cancelInvitation(event.request.headers, id).pipe(
            // Already accepted or cancelled elsewhere: the refreshed list shows the outcome.
            Effect.catchTag("Organizations.InvitationInvalid", () => Effect.void),
          );
        }),
      )
      .then(
        Result.getOrElse((failure) =>
          Match.valueTags(failure, {
            "AuthGuard.Required": AuthGuard.reject,
            "Access.UnverifiedEmail": AuthGuard.reject,
            "AuthProvider.Unavailable": AuthGuard.reject,
            "Access.NotFound": () => error(404, "This organization could not be found."),
            "Access.Denied": () => error(403, "Your role can’t cancel invitations."),
            "Organizations.Unavailable": () =>
              error(503, "We couldn’t confirm the cancellation. Check pending invitations first."),
          }),
        ),
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
  ({ id, organizationId, role }, issue) => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.changeMemberRole",
        Effect.gen(function* () {
          yield* event.locals.auth.principal;
          const organizations = yield* Organizations.Service;

          return yield* organizations
            .changeRole(event.request.headers, organizationId, id, role)
            .pipe(
              Effect.as({ _tag: "Changed" } as const),
              // Correctable rejections and a member already gone are handled outcomes.
              Effect.catchTags({
                "Organizations.MemberNotFound": (outcome) => Effect.succeed(outcome),
                "Organizations.RoleNotAllowed": (rejection) => Effect.succeed(rejection),
                "Organizations.LastOwner": (rejection) => Effect.succeed(rejection),
              }),
            );
        }),
      )
      .then(
        Result.getOrElse((failure) =>
          Match.valueTags(failure, {
            "AuthGuard.Required": AuthGuard.reject,
            "Access.UnverifiedEmail": AuthGuard.reject,
            "AuthProvider.Unavailable": AuthGuard.reject,
            "Organizations.Unavailable": () =>
              error(
                503,
                "We couldn’t confirm the role change. Refresh the team before trying again.",
              ),
          }),
        ),
      )
      .then((outcome) =>
        Match.valueTags(outcome, {
          Changed: () => ({ changed: role }),
          // Kit refreshes the page: the row is gone, or the caller lost access.
          "Organizations.MemberNotFound": () => undefined,
          "Organizations.RoleNotAllowed": () =>
            invalid(issue.role("You can’t change this member’s role.")),
          "Organizations.LastOwner": () => invalid(issue.role("Make someone else an owner first.")),
        }),
      );
  },
);
