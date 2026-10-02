import { Result } from "effect";
import { AuthGuard } from "#lib/server/auth-guard.ts";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = (event) => {
  event.setHeaders({ "cache-control": "private, no-store" });
  return event.locals
    .run("Load.authenticated", AuthGuard.requireVerified(event))
    .then(Result.getOrElse(AuthGuard.reject))
    .then((viewer) => ({ viewer }));
};
