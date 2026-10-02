import { building, dev } from "$app/env";
import type { Handle, HandleServerError, ServerInit } from "@sveltejs/kit/hooks";
import { Cause, Config, Effect, Option } from "effect";
import { WebRuntime } from "#lib/server/runtime.ts";
import { Observability } from "#lib/server/observability.ts";

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
  return WebRuntime.request(active, event.request, event.getClientAddress()).then((run) => {
    event.locals.run = run;
    return resolve(event);
  });
};

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    process.off("sveltekit:shutdown", dispose);
    return dispose();
  });
}
