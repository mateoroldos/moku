import { MokuApi } from "@moku/api";
import { HumanTasks } from "@moku/core/human-tasks";
import { Context, Effect, Layer, type Scope } from "effect";
import { HttpEffect, HttpRouter, HttpServer, type HttpServerRequest } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiError, HttpApiScalar } from "effect/unstable/httpapi";
import { Observability } from "./observability.ts";
import { OrganizationApiKeys } from "./organization-api-keys.ts";

const unavailable = () => Effect.fail(new HttpApiError.ServiceUnavailable({}));

/** Logs the operation's outcome and reports defects, which HttpApi answers with a bare 500. */
const operation =
  (name: string) =>
  <A, E, R>(self: Effect.Effect<A, E, R>) =>
    self.pipe(Effect.tapDefect(Effect.logError), Observability.operation(name));

const apiKeyAuth = Layer.effect(
  MokuApi.ApiKeyAuth,
  Effect.gen(function* () {
    const apiKeys = yield* OrganizationApiKeys.Service;

    return MokuApi.ApiKeyAuth.of({
      bearer: (httpEffect, { credential }) =>
        apiKeys.verify(credential).pipe(
          Effect.catchTags({
            "OrganizationApiKeys.InvalidKey": () =>
              Effect.fail(
                new MokuApi.Unauthorized({
                  message: "Send an organization API key as `Authorization: Bearer <key>`.",
                }),
              ),
            "OrganizationApiKeys.RateLimited": () =>
              Effect.fail(
                new MokuApi.RateLimited({
                  message: "This key sent too many requests. Try again within a minute.",
                }),
              ),
            "OrganizationApiKeys.Unavailable": unavailable,
          }),
          operation("Api.authenticate"),
          Effect.flatMap((key) => Effect.provideService(httpEffect, MokuApi.CurrentKey, key)),
        ),
    });
  }),
);

const tasks = HttpApiBuilder.group(
  MokuApi.Api,
  "tasks",
  Effect.fn(function* (handlers) {
    const humanTasks = yield* HumanTasks.Service;

    return handlers
      .handle("create", ({ payload }) =>
        MokuApi.CurrentKey.use((key) => humanTasks.create(key, payload)).pipe(
          Effect.map(({ id }) => ({ id })),
          Effect.catchTags({
            "HumanTaskStore.PersistenceError": unavailable,
            "HumanTasks.IdGenerationError": Effect.die,
          }),
          operation("Api.tasks.create"),
        ),
      )
      .handle("get", ({ params }) =>
        MokuApi.CurrentKey.use((key) => humanTasks.get(key, params.id)).pipe(
          Effect.catchTags({
            "HumanTaskStore.NotFound": () => Effect.fail(new MokuApi.TaskNotFound({})),
            "HumanTaskStore.PersistenceError": unavailable,
            "Access.Denied": Effect.die,
          }),
          operation("Api.tasks.get"),
        ),
      );
  }),
);

export const routes = Layer.mergeAll(
  HttpApiBuilder.layer(MokuApi.Api, { openapiPath: "/api/v1/openapi.json" }).pipe(
    Layer.provide(tasks),
  ),
  HttpApiScalar.layer(MokuApi.Api, { path: "/api/v1/docs" }),
).pipe(Layer.provide(HttpServer.layerServices));

/** Answers `/api/v1` requests with the runtime's services. */
export class Handler extends Context.Service<Handler, (request: Request) => Promise<Response>>()(
  "@moku/web/HttpApi/Handler",
) {}

export const layer = Layer.effect(
  Handler,
  Effect.gen(function* () {
    const app = yield* HttpRouter.toHttpEffect(routes);
    // Requests run with the runtime's tracer and logger, and resolve the middleware here.
    const context = yield* Effect.context<MokuApi.ApiKeyAuth>();

    return HttpEffect.toWebHandlerWith<
      MokuApi.ApiKeyAuth,
      Scope.Scope | HttpServerRequest.HttpServerRequest | MokuApi.ApiKeyAuth
    >(context)(app);
  }),
).pipe(Layer.provide(apiKeyAuth));

export * as HttpApi from "./http-api.ts";
