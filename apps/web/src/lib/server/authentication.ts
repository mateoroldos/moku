import { AuthStorage } from "@moku/database-postgres/auth-storage";
import { betterAuth } from "better-auth/minimal";
import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";
import { betterAuthOptions } from "./better-auth-options.ts";

const User = Schema.Struct({ id: Schema.NonEmptyString, emailVerified: Schema.Boolean });
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

export class Unavailable extends Schema.TaggedError<Unavailable>()("Authentication.Unavailable", {
  cause: Schema.Redacted(Schema.Unknown),
}) {}

export interface Interface {
  readonly authenticate: (headers: Headers) => Effect.Effect<typeof User.Type | null, Unavailable>;
  readonly handle: (
    request: Request,
    clientAddress: string,
  ) => Effect.Effect<Response, Unavailable>;
}

export class Service extends Context.Service<Service, Interface>()("@moku/web/Authentication") {}

export type SessionLookup = Effect.Effect<typeof User.Type | null, Unavailable, Service>;

export interface RequestContext {
  readonly request: Request;
  readonly locals: { authSession?: SessionLookup };
}

export const session = ({ request, locals }: RequestContext): SessionLookup =>
  (locals.authSession ??= Effect.runSync(
    Effect.cached(Service.use((auth) => auth.authenticate(request.headers))),
  ));

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
      trustedOrigins: [origin.origin],
      secret: Redacted.value(secret),
    });
    const unavailable = (cause: unknown) => new Unavailable({ cause: Redacted.make(cause) });
    yield* Effect.tryPromise({ try: () => auth.$context, catch: unavailable });

    const authenticate = Effect.fn("Authentication.authenticate")(function* (headers: Headers) {
      const result: unknown = yield* Effect.tryPromise({
        try: () => auth.api.getSession({ headers }),
        catch: unavailable,
      });
      const session = yield* Schema.decodeUnknownEffect(Session)(result).pipe(
        Effect.mapError(unavailable),
      );
      return session?.user ?? null;
    }, Effect.uninterruptible);

    const handle = Effect.fn("Authentication.handle")(function* (
      request: Request,
      clientAddress: string,
    ) {
      if (request.method === "POST" && request.headers.get("origin") !== origin.origin)
        return new Response(null, { status: 403 });

      const headers = new Headers(request.headers);
      headers.set("x-moku-client-ip", clientAddress);
      const response = yield* Effect.tryPromise({
        try: () => auth.handler(new Request(request, { headers })),
        catch: unavailable,
      });
      if (response.status >= 500)
        return yield* unavailable(new Error(`Auth HTTP ${response.status}`));
      return response;
    }, Effect.uninterruptible);

    return Service.of({ authenticate, handle });
  }),
);

export * as Authentication from "./authentication.ts";
