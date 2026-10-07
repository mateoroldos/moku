import { AuthStorage } from "@moku/database-postgres/auth-storage";
import { runWithTransaction } from "@better-auth/core/context";
import { generateId } from "@better-auth/core/utils/id";
import { Principal, UserId } from "@moku/domain/identity";
import { Organization } from "@moku/domain/organization";
import { betterAuth } from "better-auth/minimal";
import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";
import { betterAuthOptions } from "./better-auth-options.ts";
import { Email } from "./email.ts";

const ProviderSession = Schema.NullOr(
  Schema.Struct({
    user: Schema.Struct({ id: UserId, emailVerified: Schema.Boolean }),
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

export class Unavailable extends Schema.TaggedError<Unavailable>()("AuthProvider.Unavailable", {
  cause: Schema.Redacted(Schema.Unknown),
}) {}

export interface Interface {
  readonly authenticate: (headers: Headers) => IdentityLookup<never>;
  readonly createOrganization: (
    userId: UserId,
    name: string,
  ) => Effect.Effect<Organization, Unavailable>;
  readonly handle: (
    request: Request,
    clientAddress: string,
  ) => Effect.Effect<Response, Unavailable>;
}

export class Service extends Context.Service<Service, Interface>()("@moku/web/AuthProvider") {}

export type IdentityLookup<R> = Effect.Effect<Principal | null, Unavailable, R>;

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* AuthStorage.Service;
    const origin = yield* Config.schema(Origin, "ORIGIN");
    const secret = yield* Config.redacted("BETTER_AUTH_SECRET");
    const email = yield* Email.Service;
    const runEmail = Effect.runPromiseWith(yield* Effect.context<never>());
    const send = (to: string, subject: string, text: string) =>
      runEmail(
        email.send({ to, subject, text: Redacted.make(text) }).pipe(
          // Better Auth catches some send failures; its disabled logger cannot report them.
          Effect.tapCause(() => Effect.logError("email.send.failed")),
        ),
      );

    const auth = betterAuth({
      ...betterAuthOptions,
      emailVerification: {
        sendOnSignUp: true,
        sendOnSignIn: false,
        autoSignInAfterVerification: false,
        sendVerificationEmail: ({ user, url }) =>
          send(
            user.email,
            "Verify your Moku email",
            `${url}\n\nVerify your email to sign in to Moku. If you did not request this, ignore this email.`,
          ),
      },
      emailAndPassword: {
        ...betterAuthOptions.emailAndPassword,
        sendResetPassword: ({ user, url }) =>
          send(
            user.email,
            "Reset your Moku password",
            `${url}\n\nChoose a new password. If you did not request this, ignore this email.`,
          ),
      },
      rateLimit: {
        enabled: true,
        customRules: {
          "/send-verification-email": { window: 60, max: 1 },
          "/request-password-reset": { window: 60, max: 1 },
        },
      },
      database,
      baseURL: origin.origin,
      trustedOrigins: [origin.origin],
      secret: Redacted.value(secret),
    });
    const unavailable = (cause: unknown) => new Unavailable({ cause: Redacted.make(cause) });
    const context = yield* Effect.tryPromise({ try: () => auth.$context, catch: unavailable });

    const authenticate = Effect.fn("AuthProvider.authenticate")(function* (headers: Headers) {
      const result: unknown = yield* Effect.tryPromise({
        try: () => auth.api.getSession({ headers }),
        catch: unavailable,
      });
      const session = yield* Schema.decodeUnknownEffect(ProviderSession)(result).pipe(
        Effect.mapError(unavailable),
      );
      return session === null
        ? null
        : Principal.make({
            userId: session.user.id,
            emailVerified: session.user.emailVerified,
          });
    }, Effect.uninterruptible);

    const handle = Effect.fn("AuthProvider.handle")(function* (
      request: Request,
      clientAddress: string,
    ) {
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

    const createOrganization = Effect.fn("AuthProvider.createOrganization")(function* (
      userId: UserId,
      name: string,
    ) {
      const result: unknown = yield* Effect.tryPromise({
        // Flatten Better Auth's declared Promise<Promise<...>> at the Promise boundary.
        try: () =>
          Promise.resolve(
            // A plain adapter transaction does not enlist nested provider writes.
            runWithTransaction(context.adapter, () =>
              auth.api.createOrganization({
                body: { userId, name, slug: generateId(), keepCurrentActiveOrganization: true },
              }),
            ),
          ),
        catch: unavailable,
      });

      return yield* Schema.decodeUnknownEffect(Organization)(result).pipe(
        Effect.mapError(unavailable),
      );
    }, Effect.uninterruptible);

    return Service.of({ authenticate, handle, createOrganization });
  }),
);

export * as AuthProvider from "./auth-provider.ts";
