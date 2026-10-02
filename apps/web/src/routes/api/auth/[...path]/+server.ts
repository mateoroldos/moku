import { Result } from "effect";
import { Authentication } from "#lib/server/authentication.ts";
import type { RequestHandler } from "./$types";

export const fallback: RequestHandler = ({ locals, setHeaders }) => {
  setHeaders({ "cache-control": "private, no-store" });
  return locals
    .run(
      "Endpoint.authentication",
      Authentication.Service.use((auth) => auth.handle),
    )
    .then(
      Result.getOrElse(() =>
        Response.json(
          { code: "SERVICE_UNAVAILABLE", message: "Authentication is unavailable. Try again." },
          { status: 503 },
        ),
      ),
    );
};
