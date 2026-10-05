import { form, getRequestEvent } from "$app/server";
import { Organization } from "@moku/domain/organization";
import { error } from "@sveltejs/kit";
import { Effect, Match, Result, Schema } from "effect";
import { AuthGuard } from "#lib/server/auth-guard.ts";
import { Authentication } from "#lib/server/authentication.ts";

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
          const authentication = yield* Authentication.Service;

          return yield* authentication.createOrganization(principal.userId, name);
        }),
      )
      .then(
        Result.getOrElse((failure) =>
          Match.valueTags(failure, {
            "AuthGuard.Required": AuthGuard.reject,
            "Access.Unverified": AuthGuard.reject,
            "Authentication.Unavailable": () =>
              error(
                503,
                "We couldn’t confirm creation. Check your organizations before trying again.",
              ),
          }),
        ),
      )
      .then(Schema.encodeSync(Organization));
  },
);
