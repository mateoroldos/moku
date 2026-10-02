import { building, dev } from "$app/env";
import type { Handle, HandleServerError, ServerInit } from "@sveltejs/kit/hooks";
import { Cause, Config, Effect, Option, Result } from "effect";
import { error, redirect } from "@sveltejs/kit";
import { Authentication } from "#lib/server/authentication.ts";
import { WebRuntime } from "#lib/server/runtime.ts";
import { Observability } from "#lib/server/observability.ts";
import { RequestRunner } from "#lib/server/request-runner.ts";

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

// oxlint-disable-next-line effecttsgo/async-function -- Kit owns the request/response boundary; application operations run through locals.run.
export const handle: Handle = async ({ event, resolve }) => {
  const active = runtime;
  if (active === undefined) throw new Error("Application runtime is unavailable");
  event.locals.run = RequestRunner.make(active, event.request.signal);
  const unavailable = () => error(503, "We couldn’t confirm your session. Try again.");
  if (event.url.pathname.startsWith("/api/auth/")) {
    return event.locals
      .run(
        "Auth.handle",
        Authentication.Service.use((auth) => auth.handle(event.request)),
      )
      .then(Result.getOrElse(unavailable));
  }
  event.locals.user = await event.locals
    .run(
      "Auth.authenticate",
      Authentication.Service.use((auth) => auth.authenticate(event.request.headers)),
    )
    .then(Result.getOrElse(unavailable));
  if (event.url.pathname !== "/login") {
    if (event.locals.user === null) redirect(303, "/login");
    Authentication.requireVerified(event.locals.user);
  }
  const response = await resolve(event);
  response.headers.set("cache-control", "private, no-store");
  return response;
};

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    process.off("sveltekit:shutdown", dispose);
    return dispose();
  });
}
