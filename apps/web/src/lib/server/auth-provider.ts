import { AuthStorage } from "@moku/database-postgres/auth-storage";
import { runWithTransaction } from "@better-auth/core/context";
import { generateId } from "@better-auth/core/utils/id";
import { Principal, UserId } from "@moku/domain/identity";
import { Organization } from "@moku/domain/organization";
import { betterAuth } from "better-auth/minimal";
import { APIError } from "better-auth/api";
import { emailOTP } from "better-auth/plugins/email-otp";
import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect";
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
    const auth = betterAuth({
      ...betterAuthOptions,
      plugins: [
        ...betterAuthOptions.plugins,
        emailOTP({
          storeOTP: "hashed",
          overrideDefaultEmailVerification: true,
          disableSignUp: true,
          sendVerificationOTP: ({ email: to, otp }) =>
            runEmail(
              Schema.decodeEffect(Email.Message)({
                to,
                subject: "Verify your Moku email",
                text: Redacted.make(`${otp}\n\nEnter this code in Moku within five minutes.`),
              }).pipe(
                Effect.flatMap(email.send),
                // Better Auth catches send failures; its disabled logger cannot report them.
                Effect.tapCause(() => Effect.logError("email.send.failed")),
              ),
            ),
        }),
      ],
      emailVerification: {
        autoSignInAfterVerification: true,
        sendOnSignIn: true,
        beforeEmailVerification: (user) =>
          user.emailVerified
            ? Promise.reject(
                new APIError("BAD_REQUEST", {
                  code: "EMAIL_ALREADY_VERIFIED",
                  message: "Email is already verified. Sign in instead.",
                }),
              )
            : Promise.resolve(),
      },
      rateLimit: {
        enabled: true,
        customRules: { "/email-otp/send-verification-otp": { window: 60, max: 1 } },
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
      if (new URL(request.url).pathname === "/api/auth/email-otp/send-verification-otp") {
        const input = yield* Effect.tryPromise({
          try: () => request.clone().text(),
          catch: () => null,
        }).pipe(
          Effect.flatMap(
            Schema.decodeUnknownEffect(
              Schema.fromJsonString(
                Schema.Struct({ email: Schema.String, type: Schema.Literal("email-verification") }),
              ),
            ),
          ),
          Effect.option,
        );
        if (Option.isNone(input))
          return Response.json({ message: "Invalid verification request." }, { status: 400 });
      }

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
