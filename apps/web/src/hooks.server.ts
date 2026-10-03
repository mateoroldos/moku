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
  const endpoint = Effect.runSync(
    Config.schema(Observability.CollectorEndpoint, "OTEL_EXPORTER_OTLP_ENDPOINT").pipe(
      Config.option,
    ),
  );
  runtime = WebRuntime.make(Effect.runSync(Config.redacted("DATABASE_URL")), {
    ...Option.match(endpoint, { onNone: () => ({}), onSome: (url) => ({ endpoint: url.href }) }),
    dev,
  });
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
  const kind = event.isRemoteRequest ? "Remote" : event.isDataRequest ? "Data" : "Request";
  const route =
    event.route.id === null
      ? "unmatched"
      : event.route.id.replace(/\/\([^/)]+\)(?=\/|$)/g, "") || "/";
  const name = `${kind} · ${event.request.method}${event.isRemoteRequest ? "" : ` ${route}`}`;
  return active
    .runPromise(
      Effect.useSpan(
        name,
        {
          kind: "server",
          attributes: {
            "http.request.method": event.request.method,
            "app.request.kind": kind.toLowerCase(),
            "app.span.kind": "request_scope",
          },
        },
        (span) =>
          Effect.tryPromise({
            try: () => {
              if (!event.isRemoteRequest && event.route.id !== null)
                span.attribute("http.route", route);
              event.locals.run = RequestRunner.make(active, event.request.signal, span);
              event.locals.authenticate = Effect.runSync(
                Effect.cached(
                  Authentication.Service.use((auth) => auth.authenticate(event.request.headers)),
                ),
              );
              return resolve(event).then((response) => {
                span.attribute("http.response.status_code", response.status);
                return response;
              });
            },
            catch: (cause) => cause,
          }),
      ).pipe(Effect.result),
    )
    .then(
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
