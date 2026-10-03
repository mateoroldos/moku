import { building, dev } from "$app/env";
import type { Handle, HandleServerError, ServerInit } from "@sveltejs/kit/hooks";
import { Cause, Config, Effect, Option, Result } from "effect";
import { WebRuntime } from "#lib/server/runtime.ts";
import { Observability } from "#lib/server/observability.ts";
import { RequestRunner } from "#lib/server/request-runner.ts";
import { Authentication } from "#lib/server/authentication.ts";

let runtime: WebRuntime.Runtime | undefined;
const dispose = () => runtime?.dispose();

export const init: ServerInit = () => {
  if (building) return;
  runtime = Effect.runSync(
    Effect.gen(function* () {
      const endpoint = yield* Config.schema(
        Observability.CollectorEndpoint,
        "OTEL_EXPORTER_OTLP_ENDPOINT",
      ).pipe(Config.option);
      const url = yield* Config.redacted("DATABASE_URL");
      const settings: Observability.Settings = Option.isSome(endpoint)
        ? { dev, endpoint: endpoint.value.href }
        : { dev };
      return WebRuntime.make(url, settings);
    }),
  );
  process.once("sveltekit:shutdown", dispose);
  return runtime.runPromise(Effect.void);
};

export const handleError: HandleServerError = ({ kind, error, event }) => {
  if (kind !== "unknown") return;
  const cancelled =
    event.request.signal.aborted &&
    error instanceof Error &&
    Cause.isCause(error.cause) &&
    Cause.hasInterruptsOnly(error.cause);
  if (!cancelled) {
    // oxlint-disable-next-line effecttsgo/global-console -- Report failures even when the application runtime is unavailable.
    console.error(error);
  }
  return { message: "Something went wrong. Refresh before trying again." };
};

export const handle: Handle = ({ event, resolve }) => {
  const active = runtime;
  if (active === undefined) throw new Error("Application runtime is unavailable");
  const request = Observability.request(
    {
      method: event.request.method,
      routeId: event.route.id,
      kind: event.isRemoteRequest ? "remote" : event.isDataRequest ? "data" : "request",
    },
    (span) =>
      Effect.gen(function* () {
        event.locals.run = RequestRunner.make(active, event.request.signal, span);
        event.locals.authenticate = yield* Effect.cached(
          Authentication.Service.use((auth) => auth.authenticate(event.request.headers)),
        );
        return yield* Effect.tryPromise({
          try: () => resolve(event),
          catch: (cause) => cause,
        });
      }),
  );
  return active.runPromise(request.pipe(Effect.result)).then(
    Result.match({
      onSuccess: (response) => response,
      onFailure: (cause) => {
        throw cause;
      },
    }),
  );
};

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    process.off("sveltekit:shutdown", dispose);
    return dispose();
  });
}
