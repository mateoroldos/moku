import { Result } from "effect";
import { Authentication } from "#lib/server/authentication.ts";
import type { RequestHandler } from "./$types";

export const fallback: RequestHandler = ({ locals, request, getClientAddress }) => {
  const operation = `${request.method} ${new URL(request.url).pathname}`;
  if (
    ![
      "POST /api/auth/sign-in/email",
      "POST /api/auth/sign-out",
      "GET /api/auth/get-session",
    ].includes(operation)
  )
    return new Response(null, { status: 404 });
  return locals
    .run(
      "Endpoint.authentication",
      Authentication.Service.use((auth) => auth.handle(request, getClientAddress())),
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
