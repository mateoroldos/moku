import { form, getRequestEvent, query } from "$app/server";
import { error, redirect } from "@sveltejs/kit";
import { Effect, Match, Result, Schema } from "effect";
import { AuthGuard } from "#lib/server/auth-guard.ts";
import { Organizations } from "#lib/server/organizations.ts";
import { withInvitation } from "./invitation-return.ts";

export const getInvitation = query(Schema.toStandardSchemaV1(Schema.NonEmptyString), (id) => {
  const event = getRequestEvent();

  return event.locals
    .run(
      "Remote.getInvitation",
      Effect.gen(function* () {
        const principal = yield* event.locals.auth.authenticate;
        if (!principal?.emailVerified) return { _tag: "SignedOut" } as const;
        const organizations = yield* Organizations.Service;

        return yield* organizations.getInvitation(event.request.headers, id).pipe(
          Effect.map((invitation) => ({ _tag: "Pending", invitation }) as const),
          Effect.catchTags({
            "Organizations.InvitationInvalid": () => Effect.succeed({ _tag: "Invalid" } as const),
            "Organizations.NotRecipient": () =>
              Effect.succeed({ _tag: "OtherAccount", userId: principal.userId } as const),
          }),
        );
      }),
    )
    .then(
      Result.getOrElse((failure) =>
        Match.valueTags(failure, {
          "AuthProvider.Unavailable": AuthGuard.reject,
          "Organizations.Unavailable": () =>
            error(503, "We couldn’t load this invitation. Try again."),
        }),
      ),
    );
});

export const acceptInvitation = form(
  Schema.toStandardSchemaV1(Schema.Struct({ id: Schema.NonEmptyString })),
  ({ id }) => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.acceptInvitation",
        Effect.gen(function* () {
          yield* event.locals.auth.principal;
          const organizations = yield* Organizations.Service;

          return yield* organizations.acceptInvitation(event.request.headers, id);
        }),
      )
      .then(
        Result.getOrElse((failure) =>
          Match.valueTags(failure, {
            "AuthGuard.Required": () => redirect(303, withInvitation("/login", id)),
            "Access.UnverifiedEmail": AuthGuard.reject,
            "AuthProvider.Unavailable": AuthGuard.reject,
            "Organizations.InvitationInvalid": () =>
              error(404, "This invitation is no longer valid."),
            "Organizations.NotRecipient": () =>
              error(403, "This invitation is for a different email."),
            "Organizations.Unavailable": () =>
              error(503, "We couldn’t accept this invitation. Try again."),
          }),
        ),
      )
      .then((organizationId) => redirect(303, `/org/${encodeURIComponent(organizationId)}`));
  },
);
