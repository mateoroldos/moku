import { Result } from "effect";
import { AuthProvider } from "#lib/server/auth-provider.ts";
import type { RequestHandler } from "./$types";

export const fallback: RequestHandler = ({ locals, request, getClientAddress }) => {
  const operation = `${request.method} ${new URL(request.url).pathname}`;
  if (
    ![
      "POST /api/auth/sign-in/email",
      "POST /api/auth/sign-up/email",
      "POST /api/auth/email-otp/request-password-reset",
      "POST /api/auth/email-otp/reset-password",
      "POST /api/auth/sign-out",
      "GET /api/auth/get-session",
    ].includes(operation)
  )
    return new Response(null, { status: 404 });
  return locals
    .run(
      "Endpoint.authentication",
      AuthProvider.Service.use((auth) => auth.handle(request, getClientAddress())),
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
