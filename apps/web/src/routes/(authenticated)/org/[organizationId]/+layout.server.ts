import { Access } from "@moku/core/access";
import { HumanTaskDirectory } from "@moku/core/human-task-directory";
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
        const principal = yield* AuthGuard.requireVerified(event.locals.authenticate);
        const access = yield* OrganizationAccess.Service;
        const member = yield* access.require(
          principal,
          organizationId,
          HumanTaskDirectory.permissions.list,
        );
        return {
          organizationId,
          canWrite: Access.allows(HumanTaskDirectory.permissions.respond, member.role),
        };
      }),
    )
    .then(
      Result.getOrElse((failure) =>
        Match.valueTags(failure, {
          "AuthGuard.Required": AuthGuard.reject,
          "Access.Unverified": AuthGuard.reject,
          "Authentication.Unavailable": AuthGuard.reject,
          "Access.NotFound": () => error(404, "This organization could not be found."),
          "Access.Denied": () => error(403, "Your role does not allow viewing tasks."),
          "OrganizationMembership.Unavailable": () =>
            error(503, "We couldn’t verify your access. Try again."),
        }),
      ),
    );
};
