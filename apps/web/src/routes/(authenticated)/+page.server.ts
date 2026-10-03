import { OrganizationMembership } from "@moku/core/organization-membership";
import { error, redirect } from "@sveltejs/kit";
import { Effect, Match, Result } from "effect";
import { AuthGuard } from "#lib/server/auth-guard.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = (event) =>
  event.locals
    .run(
      "Load.home",
      Effect.gen(function* () {
        const principal = yield* AuthGuard.requireVerified(event.locals.authenticate);
        const memberships = yield* OrganizationMembership.Service;
        return yield* memberships.list(principal.userId);
      }),
    )
    .then(
      Result.getOrElse((failure) =>
        Match.valueTags(failure, {
          "AuthGuard.Required": AuthGuard.reject,
          "Access.Unverified": AuthGuard.reject,
          "Authentication.Unavailable": AuthGuard.reject,
          "OrganizationMembership.Unavailable": () =>
            error(503, "We couldn’t load your organization. Try again."),
        }),
      ),
    )
    .then((organizations) => {
      const first = organizations[0];
      if (first) redirect(303, `/org/${encodeURIComponent(first.id)}`);
    });
