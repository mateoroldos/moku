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
          yield* AuthGuard.requireVerifiedPrincipal(event.locals.authenticate);
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
      .then(Schema.encodeSync(Schema.Array(Organizations.MemberSummary)));
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
          const principal = yield* AuthGuard.requireVerifiedPrincipal(event.locals.authenticate);
          const organizations = yield* Organizations.Service;

          return yield* organizations.createWithOwner(principal.userId, { name });
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
