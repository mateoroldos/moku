import { form, getRequestEvent, query } from "$app/server";
import { OrganizationDirectory } from "@moku/core/organization-directory";
import { OrganizationMembershipStore } from "@moku/core/organization-membership-store";
import { OrganizationId } from "@moku/domain/organization";
import { error, redirect } from "@sveltejs/kit";
import { Effect, Match, Result, Schema } from "effect";
import { AuthGuard } from "#lib/server/auth-guard.ts";
import { AuthProvider } from "#lib/server/auth-provider.ts";

export const listOrganizationMembers = query(
  Schema.toStandardSchemaV1(OrganizationId),
  (organizationId) => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.listOrganizationMembers",
        Effect.gen(function* () {
          const principal = yield* AuthGuard.requireVerified(event.locals.authenticate);
          const directory = yield* OrganizationDirectory.Service;

          return yield* directory.listMembers(principal, organizationId);
        }),
      )
      .then(
        Result.getOrElse((failure) =>
          Match.valueTags(failure, {
            "AuthGuard.Required": AuthGuard.reject,
            "Access.Unverified": AuthGuard.reject,
            "AuthProvider.Unavailable": AuthGuard.reject,
            "Access.NotFound": () => error(404, "This organization could not be found."),
            "Access.Denied": () => error(403, "Your role does not allow viewing the team."),
            "OrganizationMembershipStore.Unavailable": () =>
              error(503, "We couldn’t load your team. Try again."),
          }),
        ),
      )
      .then(Schema.encodeSync(Schema.Array(OrganizationMembershipStore.MemberSummary)));
  },
);

export const createOrganization = form(
  Schema.toStandardSchemaV1(
    Schema.Struct({
      name: Schema.Trim.check(Schema.isNonEmpty({ message: "Enter an organization name." })),
    }),
    { parseOptions: { onExcessProperty: "error" } },
  ),
  ({ name }) => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.createOrganization",
        Effect.gen(function* () {
          const principal = yield* AuthGuard.requireVerified(event.locals.authenticate);
          const provider = yield* AuthProvider.Service;

          return yield* provider.createOrganization(principal.userId, name);
        }),
      )
      .then(
        Result.getOrElse((failure) =>
          Match.valueTags(failure, {
            "AuthGuard.Required": AuthGuard.reject,
            "Access.Unverified": AuthGuard.reject,
            "AuthProvider.Unavailable": () =>
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
