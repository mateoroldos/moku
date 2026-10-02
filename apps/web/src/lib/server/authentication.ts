import { AuthStorage } from "@moku/database-postgres/auth-storage";
import { error } from "@sveltejs/kit";
import { betterAuth } from "better-auth/minimal";
import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";
import { betterAuthOptions } from "./better-auth-options.ts";

const User = Schema.Struct({ id: Schema.NonEmptyString, emailVerified: Schema.Boolean });
export type User = typeof User.Type;
const Session = Schema.NullOr(Schema.Struct({ user: User }));
const Origin = Schema.URLFromString.check(
  Schema.makeFilter((url) =>
    url.href === `${url.origin}/` &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
      ? undefined
      : "Expected an HTTPS origin or local HTTP origin",
  ),
);

export class Unavailable extends Schema.TaggedError<Unavailable>()(
  "Authentication.Unavailable",
  {},
) {}

export interface Interface {
  readonly handle: (request: Request) => Effect.Effect<Response, Unavailable>;
  readonly authenticate: (headers: Headers) => Effect.Effect<User | null, Unavailable>;
}
export class Service extends Context.Service<Service, Interface>()("@moku/web/Authentication") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* AuthStorage.Service;
    const origin = yield* Config.schema(Origin, "ORIGIN");
    const secret = yield* Config.redacted("BETTER_AUTH_SECRET");
    const auth = betterAuth({
      ...betterAuthOptions,
      database,
      baseURL: origin.origin,
      secret: Redacted.value(secret),
      trustedOrigins: [origin.origin],
      advanced: {
        useSecureCookies: origin.protocol === "https:",
        trustedProxyHeaders: false,
        ipAddress: { ipAddressHeaders: [] },
      },
      logger: { disabled: true },
      onAPIError: { throw: true },
    });
    // Provider failures can contain SQL parameters and credentials; retain only the safe error tag.
    const unavailable = () => new Unavailable({});
    const context = yield* Effect.tryPromise({ try: () => auth.$context, catch: unavailable });
    const handle = Effect.fn("Authentication.handle")(function* (request: Request) {
      const path = new URL(request.url).pathname;
      if (
        !(
          (request.method === "POST" &&
            ["/api/auth/sign-in/email", "/api/auth/sign-out"].includes(path)) ||
          (request.method === "GET" && path === "/api/auth/get-session")
        )
      )
        return new Response(null, { status: 404 });
      if (request.method === "POST" && request.headers.get("origin") !== origin.origin)
        return new Response(null, { status: 403 });
      // Better Auth swallows signout database errors. Confirm revocation before it expires cookies.
      if (path === "/api/auth/sign-out") {
        const session = yield* Effect.tryPromise({
          try: () =>
            auth.api.getSession({ headers: request.headers, query: { disableRefresh: true } }),
          catch: unavailable,
        });
        if (session !== null)
          yield* Effect.tryPromise({
            try: () => context.internalAdapter.deleteSession(session.session.token),
            catch: unavailable,
          });
      }
      const response = yield* Effect.tryPromise({
        try: () => auth.handler(request),
        catch: unavailable,
      });
      if (response.status >= 500) return yield* unavailable();
      return response;
    }, Effect.uninterruptible);
    const authenticate = Effect.fn("Authentication.authenticate")(function* (headers: Headers) {
      const raw: unknown = yield* Effect.tryPromise({
        try: () =>
          auth.api.getSession({
            headers,
            query: { disableRefresh: true, disableCookieCache: true },
          }),
        catch: unavailable,
      });
      const session = yield* Schema.decodeUnknownEffect(Session)(raw).pipe(
        Effect.mapError(unavailable),
      );
      return session?.user ?? null;
    }, Effect.uninterruptible);
    return Service.of({ handle, authenticate });
  }),
);

export const requireVerified = (user: User | null) => {
  if (user === null) error(401, "Sign in to review tasks.");
  if (!user.emailVerified) error(403, "Verify your email before reviewing tasks.");
  return user;
};

export * as Authentication from "./authentication.ts";
