import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { Result } from "effect";
import { Authentication } from "#lib/server/authentication.ts";

const handle: RequestHandler = ({ request, locals }) =>
  locals
    .run(
      "Auth.handle",
      Authentication.Service.use((auth) => auth.handle(request)),
    )
    .then(Result.getOrElse(() => error(503, "Authentication is unavailable. Please try again.")));

export const GET = handle;
export const POST = handle;
