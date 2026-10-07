import { Access } from "@moku/core/access";
import { HumanTasks } from "@moku/core/human-tasks";
import { OrganizationAccess } from "@moku/core/organization-access";
import { OrganizationId } from "@moku/domain/organization";
import { error } from "@sveltejs/kit";
import { Effect, Match, Result, Schema } from "effect";
import { AuthGuard } from "#lib/server/auth-guard.ts";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = (event) => {
  const organizationId = Schema.decodeResult(OrganizationId)(event.params.organizationId).pipe(
    Result.getOrElse(() => error(404, "This organization could not be found.")),
  );
  return event.locals
    .run(
      "Load.organization",
      Effect.gen(function* () {
        const principal = yield* AuthGuard.requireVerifiedEmail(event.locals.authenticate);
        const access = yield* OrganizationAccess.Service;
        const membership = yield* access.require(
          principal,
          organizationId,
          HumanTasks.allowedRoles.list,
        );
        return {
          organizationId,
          canRespondToHumanTasks: Access.allows(HumanTasks.allowedRoles.respond, membership.role),
        };
      }),
    )
    .then(
      Result.getOrElse((failure) =>
        Match.valueTags(failure, {
          "AuthGuard.Required": AuthGuard.reject,
          "Access.UnverifiedEmail": AuthGuard.reject,
          "AuthProvider.Unavailable": AuthGuard.reject,
          "Access.NotFound": () => error(404, "This organization could not be found."),
          "Access.Denied": () => error(403, "Your role does not allow viewing tasks."),
          "OrganizationMembershipStore.Unavailable": () =>
            error(503, "We couldn’t verify your access. Try again."),
        }),
      ),
    );
};
