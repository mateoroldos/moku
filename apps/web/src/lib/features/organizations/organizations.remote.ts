import { command, form, getRequestEvent, query, requested } from "$app/server";
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

/**
 * A refusal the caller can't fix by retrying; the client shows its message. Commands refresh
 * the client's requested list only on success, so a refusal leaves the row, and any dialog
 * showing it, in place until the client refreshes.
 */
type Rejected = { readonly rejected: string };

export const cancelInvitation = command(
  Schema.toStandardSchemaV1(Schema.Struct({ id: Schema.NonEmptyString }), {
    parseOptions: { onExcessProperty: "error" },
  }),
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
          onSuccess: () => undefined,
          onFailure: (failure) =>
            Match.valueTags(failure, {
              "AuthGuard.Required": AuthGuard.rejectCommand,
              "Access.UnverifiedEmail": AuthGuard.rejectCommand,
              "AuthProvider.Unavailable": AuthGuard.rejectCommand,
              "Access.NotFound": () => error(404, "This organization could not be found."),
              "Access.Denied": () => error(403, "Your role can’t cancel invitations."),
              // Already accepted, cancelled, or expired: the refreshed list shows it gone.
              "Organizations.InvitationInvalid": () => undefined,
              "Organizations.Unavailable": () =>
                error(503, "We couldn’t confirm the cancellation. Try again."),
            }),
        }),
      )
      .then(async (outcome) => {
        const updates = requested(listInvitations, 1);
        await (outcome ? updates.ignoreAll() : updates.refreshAll());

        return outcome;
      });
  },
);

export const changeMemberRole = command(
  Schema.toStandardSchemaV1(
    Schema.Struct({
      organizationId: OrganizationId,
      memberId: Schema.NonEmptyString,
      role: OrganizationRole,
    }),
    { parseOptions: { onExcessProperty: "error" } },
  ),
  ({ organizationId, memberId, role }): Promise<Rejected | undefined> => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.changeMemberRole",
        Effect.gen(function* () {
          yield* event.locals.auth.principal;
          const organizations = yield* Organizations.Service;

          return yield* organizations.changeRole(
            event.request.headers,
            organizationId,
            memberId,
            role,
          );
        }),
      )
      .then(
        Result.match({
          onSuccess: () => undefined,
          onFailure: (failure) =>
            Match.valueTags(failure, {
              "AuthGuard.Required": AuthGuard.rejectCommand,
              "Access.UnverifiedEmail": AuthGuard.rejectCommand,
              "AuthProvider.Unavailable": AuthGuard.rejectCommand,
              // The refreshed list shows the member gone.
              "Organizations.MemberNotFound": () => undefined,
              "Organizations.RoleNotAllowed": () => ({
                rejected: "You can’t change this member’s role.",
              }),
              "Organizations.LastOwner": () => ({ rejected: "Make someone else an owner first." }),
              "Organizations.Unavailable": () =>
                error(503, "We couldn’t confirm the role change. Try again."),
            }),
        }),
      )
      .then(async (outcome) => {
        const updates = requested(listOrganizationMembers, 1);
        await (outcome ? updates.ignoreAll() : updates.refreshAll());

        return outcome;
      });
  },
);

export const removeMember = command(
  Schema.toStandardSchemaV1(
    Schema.Struct({ organizationId: OrganizationId, memberId: Schema.NonEmptyString }),
    { parseOptions: { onExcessProperty: "error" } },
  ),
  ({ organizationId, memberId }): Promise<Rejected | undefined> => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.removeMember",
        Effect.gen(function* () {
          yield* event.locals.auth.principal;
          const organizations = yield* Organizations.Service;

          return yield* organizations.removeMember(event.request.headers, organizationId, memberId);
        }),
      )
      .then(
        Result.match({
          onSuccess: () => undefined,
          onFailure: (failure) =>
            Match.valueTags(failure, {
              "AuthGuard.Required": AuthGuard.rejectCommand,
              "Access.UnverifiedEmail": AuthGuard.rejectCommand,
              "AuthProvider.Unavailable": AuthGuard.rejectCommand,
              // Already gone is what the caller asked for.
              "Organizations.MemberNotFound": () => undefined,
              "Organizations.RemovalNotAllowed": () => ({
                rejected: "You can’t remove this member.",
              }),
              "Organizations.Unavailable": () =>
                error(503, "We couldn’t confirm the removal. Try again."),
            }),
        }),
      )
      .then(async (outcome) => {
        const updates = requested(listOrganizationMembers, 1);
        await (outcome ? updates.ignoreAll() : updates.refreshAll());

        return outcome;
      });
  },
);
