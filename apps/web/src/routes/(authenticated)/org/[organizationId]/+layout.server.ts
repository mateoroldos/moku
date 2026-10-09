import { Access } from "@moku/core/access";
import { HumanTasks } from "@moku/core/human-tasks";
import { OrganizationId } from "@moku/domain/organization";
import { error } from "@sveltejs/kit";
import { Effect, Match, Result, Schema } from "effect";
import { AuthGuard } from "#lib/server/auth-guard.ts";
import { assignableRoles, organizationRoles } from "#lib/server/better-auth-options.ts";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = (event) => {
  const organizationId = Schema.decodeResult(OrganizationId)(event.params.organizationId).pipe(
    Result.getOrElse(() => error(404, "This organization could not be found.")),
  );
  return event.locals
    .run(
      "Load.organization",
      Effect.gen(function* () {
        const membership = yield* event.locals.auth.membership(organizationId);
        yield* Access.requireRole(HumanTasks.allowedRoles.list, membership.role);
        const role = organizationRoles[membership.role];
        const assignable = assignableRoles(membership.role);

        return {
          organizationId,
          canRespondToHumanTasks: Access.allows(HumanTasks.allowedRoles.respond, membership.role),
          canDeleteOrganization: role.authorize({ organization: ["delete"] }).success,
          invitationRoles: role.authorize({ invitation: ["create", "cancel"] }).success
            ? assignable
            : [],
          memberRoles: role.authorize({ member: ["update", "delete"] }).success ? assignable : [],
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
          "Organizations.Unavailable": () =>
            error(503, "We couldn’t verify your access. Try again."),
        }),
      ),
    );
};
