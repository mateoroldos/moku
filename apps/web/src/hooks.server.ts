import { building } from "$app/env";
import type { Handle, ServerInit } from "@sveltejs/kit/hooks";
import { Config, Effect } from "effect";
import { WebRuntime } from "./lib/server/runtime.ts";

let runtime: WebRuntime.Runtime | undefined;
const dispose = () => runtime?.dispose();

export const init: ServerInit = () => {
  if (building) return;
  runtime = WebRuntime.make(Effect.runSync(Config.redacted("DATABASE_URL")));
  process.once("sveltekit:shutdown", dispose);
  return runtime.runPromise(Effect.void);
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
