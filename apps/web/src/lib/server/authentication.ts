import { AuthStorage } from "@moku/database-postgres/auth-storage";
import { betterAuth } from "better-auth/minimal";
import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";
import { betterAuthOptions } from "./better-auth-options.ts";

const Session = Schema.NullOr(
  Schema.Struct({
    user: Schema.Struct({ id: Schema.NonEmptyString, emailVerified: Schema.Boolean }),
  }),
);
const Origin = Schema.URLFromString.check(
  Schema.makeFilter((url) =>
    url.href === `${url.origin}/` &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
      ? undefined
      : "Expected an HTTPS origin or local HTTP origin",
  ),
);

export class Unavailable extends Schema.TaggedError<Unavailable>()("Authentication.Unavailable", {
  cause: Schema.Redacted(Schema.Unknown),
}) {}

export interface Interface {
  readonly authenticate: Effect.Effect<typeof Session.Type, Unavailable>;
  readonly handle: Effect.Effect<Response, Unavailable>;
}
export class Service extends Context.Service<Service, Interface>()("@moku/web/Authentication") {}
export class Factory extends Context.Service<
  Factory,
  (request: Request) => Effect.Effect<Interface>
>()("@moku/web/AuthenticationFactory") {}

export const layer = Layer.effect(
  Factory,
  Effect.gen(function* () {
    const database = yield* AuthStorage.Service;
    const origin = yield* Config.schema(Origin, "ORIGIN");
    const secret = yield* Config.redacted("BETTER_AUTH_SECRET");
    const auth = betterAuth({
      ...betterAuthOptions,
      database,
      baseURL: origin.origin,
      trustedOrigins: [origin.origin],
      secret: Redacted.value(secret),
    });
    const unavailable = (cause: unknown) => new Unavailable({ cause: Redacted.make(cause) });
    yield* Effect.tryPromise({ try: () => auth.$context, catch: unavailable });

    return Effect.fnUntraced(function* (request: Request) {
      const authenticate = yield* Effect.cached(
        Effect.gen(function* () {
          const session: unknown = yield* Effect.tryPromise({
            try: () =>
              auth.api.getSession({
                headers: request.headers,
                query: { disableRefresh: true, disableCookieCache: true },
              }),
            catch: unavailable,
          });
          return yield* Schema.decodeUnknownEffect(Session)(session).pipe(
            Effect.mapError(unavailable),
          );
        }).pipe(Effect.uninterruptible, Effect.withSpan("Authentication.authenticate")),
      );
      const handle = Effect.gen(function* () {
        const operation = `${request.method} ${new URL(request.url).pathname}`;
        if (
          ![
            "POST /api/auth/sign-in/email",
            "POST /api/auth/sign-out",
            "GET /api/auth/get-session",
          ].includes(operation)
        )
          return new Response(null, { status: 404 });
        if (request.method === "POST" && request.headers.get("origin") !== origin.origin)
          return new Response(null, { status: 403 });
        const response = yield* Effect.tryPromise({
          try: () => auth.handler(request),
          catch: unavailable,
        });
        if (response.status >= 500)
          return yield* unavailable(new Error(`Auth HTTP ${response.status}`));
        return response;
      }).pipe(Effect.uninterruptible, Effect.withSpan("Authentication.handle"));
      return Service.of({ authenticate, handle });
    });
  }),
);

export * as Authentication from "./authentication.ts";
