import { Effect, Result } from "effect";
import { HttpApi } from "#lib/server/http-api.ts";
import type { RequestHandler } from "./$types";

export const fallback: RequestHandler = ({ locals, request }) =>
  locals
    .run(
      "Endpoint.api",
      HttpApi.Handler.use((handle) => Effect.promise(() => handle(request))),
    )
    .then(Result.getOrThrow);
