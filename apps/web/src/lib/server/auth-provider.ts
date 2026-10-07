import { AuthStorage } from "@moku/database-postgres/auth-storage";
import { runWithTransaction } from "@better-auth/core/context";
import { generateId } from "@better-auth/core/utils/id";
import { Email } from "@moku/core/email";
import { Invitations } from "@moku/core/invitations";
import { OrganizationCreation } from "@moku/core/organization-creation";
import { Principal, UserId } from "@moku/domain/identity";
import { Membership, Organization } from "@moku/domain/organization";
import { isAPIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { organization } from "better-auth/plugins/organization";
import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";
import { betterAuthOptions, organizationOptions } from "./better-auth-options.ts";

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
  readonly invitationSession: (
    headers: Headers,
  ) => Effect.Effect<Invitations.Session | null, Unavailable>;
  readonly handle: (
    request: Request,
    clientAddress: string,
  ) => Effect.Effect<Response, Unavailable>;
}

export class Service extends Context.Service<Service, Interface>()("@moku/web/AuthProvider") {}

export type IdentityLookup<R> = Effect.Effect<Principal | null, Unavailable, R>;

export const layer = Layer.effectContext(
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
      plugins: [
        {
          ...organization({
            ...organizationOptions,
            sendInvitationEmail: ({ id, email, organization: team }) =>
              send(
                email,
                `Join ${team.name} on Moku`,
                `${origin.origin}/invitations/${encodeURIComponent(id)}\n\nYou have been invited to join ${team.name}. Sign in or create an account with this email address to accept.`,
              ),
          }),
          schema: betterAuthOptions.plugins[0].schema,
        },
      ],
      emailVerification: {
        sendOnSignUp: true,
        sendOnSignIn: false,
        autoSignInAfterVerification: true,
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

    const invitationFailure = (cause: unknown) => {
      if (isAPIError(cause)) {
        const reasons = new Map<string, Invitations.Rejected["reason"]>([
          ["INVALID_EMAIL", "InvalidEmail"],
          ["USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION", "AlreadyInvited"],
          ["USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION", "AlreadyMember"],
          ["INVITATION_NOT_FOUND", "InvalidInvitation"],
          ["ORGANIZATION_NOT_FOUND", "InvalidInvitation"],
          ["YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION", "WrongRecipient"],
          ["MEMBER_NOT_FOUND", "Denied"],
          ["YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION", "Denied"],
          ["YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE", "Denied"],
          [
            "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION",
            "UnverifiedEmail",
          ],
          ["INVITATION_LIMIT_REACHED", "LimitReached"],
          ["ORGANIZATION_MEMBERSHIP_LIMIT_REACHED", "LimitReached"],
        ]);
        const reason =
          cause.statusCode === 401 ? "SessionRequired" : reasons.get(cause.body?.code ?? "");
        if (reason) return new Invitations.Rejected({ reason });
      }

      return new Invitations.Unavailable({ cause: Redacted.make(cause) });
    };
    const invitationSession = Effect.fn("AuthProvider.invitationSession")(function* (
      requestHeaders: Headers,
    ) {
      const headers = new Headers(requestHeaders);
      const principal = yield* authenticate(headers);
      if (principal === null) return null;

      return {
        principal,
        create: Effect.fn("InvitationsBetterAuth.create")(function* (
          input: Invitations.CreateInput,
        ) {
          const result = yield* Effect.tryPromise({
            try: () => auth.api.createInvitation({ headers, body: input }),
            catch: invitationFailure,
          });

          const invitation = yield* Schema.decodeEffect(
            Schema.Struct({ id: Invitations.InvitationId }),
          )(result).pipe(Effect.mapError(invitationFailure));

          return invitation.id;
        }, Effect.uninterruptible),
        accept: Effect.fn("InvitationsBetterAuth.accept")(function* (id: Invitations.InvitationId) {
          const result = yield* Effect.tryPromise({
            try: () => auth.api.acceptInvitation({ headers, body: { invitationId: id } }),
            catch: invitationFailure,
          });

          const accepted = yield* Schema.decodeUnknownEffect(Schema.Struct({ member: Membership }))(
            result,
          ).pipe(Effect.mapError(invitationFailure));

          return accepted.member;
        }, Effect.uninterruptible),
      } satisfies Invitations.Session;
    });

    const creationUnavailable = (cause: unknown) =>
      new OrganizationCreation.Unavailable({ cause: Redacted.make(cause) });
    const createWithOwner = Effect.fn("OrganizationCreationBetterAuth.createWithOwner")(function* (
      ownerUserId: UserId,
      { name }: OrganizationCreation.Input,
    ) {
      const result: unknown = yield* Effect.tryPromise({
        // Flatten Better Auth's declared Promise<Promise<...>> at the Promise boundary.
        try: () =>
          Promise.resolve(
            // A plain adapter transaction does not enlist nested provider writes.
            runWithTransaction(context.adapter, () =>
              auth.api.createOrganization({
                body: {
                  userId: ownerUserId,
                  name,
                  slug: generateId(),
                  keepCurrentActiveOrganization: true,
                },
              }),
            ),
          ),
        catch: creationUnavailable,
      });

      return yield* Schema.decodeUnknownEffect(Organization)(result).pipe(
        Effect.mapError(creationUnavailable),
      );
    }, Effect.uninterruptible);

    return Context.make(Service, { authenticate, handle, invitationSession }).pipe(
      Context.add(OrganizationCreation.Service, { createWithOwner }),
    );
  }),
);

export * as AuthProvider from "./auth-provider.ts";
