import { form, getRequestEvent, query } from "$app/server";
import { OrganizationId } from "@moku/domain/organization";
import { error, redirect } from "@sveltejs/kit";
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
  ({ organizationId, ...input }) => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.inviteTeammate",
        Effect.gen(function* () {
          yield* event.locals.auth.principal;
          const organizations = yield* Organizations.Service;

          return yield* organizations.invite(event.request.headers, organizationId, input).pipe(
            Effect.as("invited" as const),
            Effect.catchTags({
              "Organizations.AlreadyMember": () => Effect.succeed("already-member" as const),
              "Organizations.InvitationLimit": () => Effect.succeed("limit-reached" as const),
            }),
            // Native submissions render the outcome from the form result.
            Effect.map((outcome) => ({ outcome, email: input.email })),
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
            "Access.Denied": () => error(403, "Your role can’t send this invitation."),
            "Organizations.Unavailable": () =>
              error(503, "We couldn’t confirm the invitation. Check pending invitations first."),
          }),
        ),
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
        Result.getOrElse((failure) =>
          Match.valueTags(failure, {
            "AuthGuard.Required": AuthGuard.reject,
            "Access.UnverifiedEmail": AuthGuard.reject,
            "AuthProvider.Unavailable": AuthGuard.reject,
            "Access.NotFound": () => error(404, "This organization could not be found."),
            "Access.Denied": () => error(403, "Only owners and admins can cancel invitations."),
            "Organizations.InvitationInvalid": () =>
              error(404, "This invitation could not be found."),
            "Organizations.Unavailable": () =>
              error(503, "We couldn’t confirm the cancellation. Check pending invitations first."),
          }),
        ),
      );
  },
);
