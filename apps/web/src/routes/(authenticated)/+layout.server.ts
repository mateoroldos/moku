import { OrganizationMembershipStore } from "@moku/core/organization-membership-store";
import { error } from "@sveltejs/kit";
import { Effect, Match, Result } from "effect";
import { AuthGuard } from "#lib/server/auth-guard.ts";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = (event) => {
  event.setHeaders({ "cache-control": "no-store" });
  return event.locals
    .run(
      "Load.authenticated",
      Effect.gen(function* () {
        const viewer = yield* AuthGuard.requireVerified(event.locals.authenticate);
        const memberships = yield* OrganizationMembershipStore.Service;
        const organizations = yield* memberships.list(viewer.userId);

        return { viewer, organizations };
      }),
    )
    .then(
      Result.getOrElse((failure) =>
        Match.valueTags(failure, {
          "AuthGuard.Required": AuthGuard.reject,
          "Access.Unverified": AuthGuard.reject,
          "Authentication.Unavailable": AuthGuard.reject,
          "OrganizationMembershipStore.Unavailable": () =>
            error(503, "We couldn’t load your organizations. Try again."),
        }),
      ),
    );
};
