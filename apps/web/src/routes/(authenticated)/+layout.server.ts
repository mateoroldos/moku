import { error } from "@sveltejs/kit";
import { Effect, Match, Result } from "effect";
import { AuthGuard } from "#lib/server/auth-guard.ts";
import { Organizations } from "#lib/server/organizations.ts";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = (event) => {
  event.setHeaders({ "cache-control": "no-store" });
  return event.locals
    .run(
      "Load.authenticated",
      Effect.gen(function* () {
        const viewer = yield* AuthGuard.requireVerifiedPrincipal(event.locals.authenticate);
        const service = yield* Organizations.Service;
        const organizations = yield* service.list(event.request.headers);

        return { viewer, organizations };
      }),
    )
    .then(
      Result.getOrElse((failure) =>
        Match.valueTags(failure, {
          "AuthGuard.Required": AuthGuard.reject,
          "Access.UnverifiedEmail": AuthGuard.reject,
          "AuthProvider.Unavailable": AuthGuard.reject,
          "Organizations.Unavailable": () =>
            error(503, "We couldn’t load your organizations. Try again."),
        }),
      ),
    );
};
