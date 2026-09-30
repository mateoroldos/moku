import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import * as authSchema from "@moku/database-postgres/auth-schema";
import { betterAuth } from "better-auth/minimal";
import type { PgAsyncDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Context, Effect, Redacted, Schema } from "effect";
import type { AuthConfig } from "./auth-config.ts";
import { betterAuthOptions } from "./better-auth-options.ts";

export class Unavailable extends Schema.TaggedError<Unavailable>()("Authentication.Unavailable", {
  cause: Schema.Defect(),
}) {}

export interface Interface {
  readonly handle: (request: Request) => Effect.Effect<Response, Unavailable>;
}

export class Service extends Context.Service<Service, Interface>()("@moku/web/Authentication") {}

export const make = (
  database: PgAsyncDatabase<PgQueryResultHKT, typeof authSchema.authRelations>,
  settings: AuthConfig.Settings,
): Interface => {
  const auth = betterAuth({
    ...betterAuthOptions,
    baseURL: settings.origin.origin,
    secret: Redacted.value(settings.secret),
    database: drizzleAdapter(database, { provider: "pg", schema: authSchema, transaction: true }),
  });
  const handle = Effect.fn("Authentication.handle")(function* (request: Request) {
    const path = new URL(request.url).pathname;
    // Enable each additional provider endpoint with its owning feature and policy.
    const allowed =
      (request.method === "GET" && path === "/api/auth/get-session") ||
      (request.method === "POST" &&
        (path === "/api/auth/sign-in/email" || path === "/api/auth/sign-out"));
    if (!allowed) return new Response(null, { status: 404 });

    // Provider database promises cannot be canceled; let them settle before pool disposal.
    const response = yield* Effect.tryPromise({
      try: () => auth.handler(request),
      catch: (cause) => new Unavailable({ cause }),
    }).pipe(Effect.uninterruptible);
    if (response.status >= 500) {
      return yield* new Unavailable({
        cause: new Error(`Auth provider returned ${response.status}`),
      });
    }
    return response;
  });
  return Service.of({ handle });
};

export * as Authentication from "./authentication.ts";
