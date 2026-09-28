import { building } from "$app/env";
import type { Handle, HandleServerError, ServerInit } from "@sveltejs/kit/hooks";
import { Cause, Config, Effect } from "effect";
import { WebRuntime } from "./lib/server/runtime.ts";

let runtime: WebRuntime.Runtime | undefined;
const dispose = () => runtime?.dispose();

export const init: ServerInit = () => {
  if (building) return;
  runtime = WebRuntime.make(Effect.runSync(Config.redacted("DATABASE_URL")));
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
  event.locals.run = (program) => active.runPromise(program, { signal: event.request.signal });
  return resolve(event);
};

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    process.off("sveltekit:shutdown", dispose);
    return dispose();
  });
}
