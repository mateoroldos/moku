import { Result } from "effect";
import { AuthGuard } from "#lib/server/auth-guard.ts";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals, setHeaders }) => {
  setHeaders({ "cache-control": "private, no-store" });
  return locals
    .run("Load.authenticated", AuthGuard.requireVerified)
    .then(Result.getOrElse(AuthGuard.reject))
    .then((viewer) => ({ viewer }));
};
