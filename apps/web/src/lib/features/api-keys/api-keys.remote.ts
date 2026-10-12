import { form, getRequestEvent, query } from "$app/server";
import { OrganizationId } from "@moku/domain/organization";
import { error, invalid } from "@sveltejs/kit";
import { Effect, Match, Redacted, Result, Schema } from "effect";
import { AuthGuard } from "#lib/server/auth-guard.ts";
import { OrganizationApiKeys } from "#lib/server/organization-api-keys.ts";

export const listApiKeys = query(Schema.toStandardSchemaV1(OrganizationId), (organizationId) => {
  const event = getRequestEvent();

  return event.locals
    .run(
      "Remote.listApiKeys",
      Effect.gen(function* () {
        yield* event.locals.auth.principal;
        const apiKeys = yield* OrganizationApiKeys.Service;

        return yield* apiKeys.list(event.request.headers, organizationId);
      }),
    )
    .then(
      Result.match({
        onSuccess: Schema.encodeSync(Schema.Array(OrganizationApiKeys.ApiKey)),
        onFailure: (failure) =>
          Match.valueTags(failure, {
            "AuthGuard.Required": AuthGuard.reject,
            "Access.UnverifiedEmail": AuthGuard.reject,
            "AuthProvider.Unavailable": AuthGuard.reject,
            "Access.NotFound": () => error(404, "This organization could not be found."),
            "Access.Denied": () => error(403, "Your role can’t see API keys."),
            "OrganizationApiKeys.Unavailable": () =>
              error(503, "We couldn’t load API keys. Try again."),
          }),
      }),
    );
});

export const createApiKey = form(
  Schema.toStandardSchemaV1(
    Schema.Struct({ organizationId: OrganizationId, ...OrganizationApiKeys.CreateInput.fields }),
    { parseOptions: { onExcessProperty: "error" } },
  ),
  ({ organizationId, ...input }) => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.createApiKey",
        Effect.gen(function* () {
          yield* event.locals.auth.principal;
          const apiKeys = yield* OrganizationApiKeys.Service;

          return yield* apiKeys.create(event.request.headers, organizationId, input);
        }),
      )
      .then(
        Result.match({
          onSuccess: ({ apiKey, secret }) => ({
            name: apiKey.name,
            secret: Redacted.value(secret),
          }),
          onFailure: (failure) =>
            Match.valueTags(failure, {
              "AuthGuard.Required": AuthGuard.reject,
              "Access.UnverifiedEmail": AuthGuard.reject,
              "AuthProvider.Unavailable": AuthGuard.reject,
              "Access.NotFound": () => error(404, "This organization could not be found."),
              "Access.Denied": () => error(403, "Your role can’t create API keys."),
              "OrganizationApiKeys.KeyLimit": () =>
                invalid("This organization has 100 keys. Revoke one before creating another."),
              "OrganizationApiKeys.Unavailable": () =>
                error(
                  503,
                  "We couldn’t confirm the key was created. Check the list before trying again.",
                ),
            }),
        }),
      );
  },
);

export const revokeApiKey = form(
  Schema.toStandardSchemaV1(
    // `revokeApiKey.for(id)` fills `id`.
    Schema.Struct({ id: Schema.NonEmptyString }),
    { parseOptions: { onExcessProperty: "error" } },
  ),
  ({ id }) => {
    const event = getRequestEvent();

    return event.locals
      .run(
        "Remote.revokeApiKey",
        Effect.gen(function* () {
          yield* event.locals.auth.principal;
          const apiKeys = yield* OrganizationApiKeys.Service;

          return yield* apiKeys.revoke(event.request.headers, id);
        }),
      )
      .then(
        Result.match({
          onSuccess: () => ({ revoked: true }),
          onFailure: (failure) =>
            Match.valueTags(failure, {
              "AuthGuard.Required": AuthGuard.reject,
              "Access.UnverifiedEmail": AuthGuard.reject,
              "AuthProvider.Unavailable": AuthGuard.reject,
              // Already gone is what the caller asked for.
              "Access.NotFound": () => ({ revoked: true }),
              "Access.Denied": () => error(403, "Your role can’t revoke API keys."),
              "OrganizationApiKeys.Unavailable": () =>
                error(503, "We couldn’t confirm the key was revoked. Try again."),
            }),
        }),
      );
  },
);
