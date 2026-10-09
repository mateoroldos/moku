import { AuthStorage } from "@moku/database-postgres/auth-storage";
import { generateId } from "@better-auth/core/utils/id";
import { Access } from "@moku/core/access";
import { Email } from "@moku/core/email";
import { Principal, UserId } from "@moku/domain/identity";
import { Organization, OrganizationId, OrganizationRole } from "@moku/domain/organization";
import { APIError, isAPIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { Clock, Config, Context, Effect, Layer, Order, Redacted, Result, Schema } from "effect";
import { betterAuthOptions, organizationPlugin } from "./better-auth-options.ts";
import { Organizations } from "./organizations.ts";

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

const ProviderRole = Schema.Struct({ role: OrganizationRole });

const ProviderMembers = Schema.Struct({
  members: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      userId: UserId,
      role: OrganizationRole,
      user: Schema.Struct({ name: Schema.String, email: Schema.String }),
    }),
  ),
});

const ProviderMemberTotal = Schema.Struct({
  members: Schema.Array(Schema.Struct({ userId: UserId })),
  total: Schema.Number,
});

const ProviderInvitations = Schema.Array(
  Schema.Struct({
    ...Organizations.PendingInvitation.fields,
    status: Schema.String,
    expiresAt: Schema.Date,
  }),
);

const ProviderAcceptance = Schema.Struct({
  member: Schema.Struct({ organizationId: OrganizationId }),
});

const memberOrder = (a: Organizations.Member, b: Organizations.Member) =>
  a.name.localeCompare(b.name) || Order.String(a.userId, b.userId);

export const SignupMode = Schema.Literals(["invite-only", "public"]);
export type SignupMode = typeof SignupMode.Type;

export class Unavailable extends Schema.TaggedError<Unavailable>()("AuthProvider.Unavailable", {
  cause: Schema.Redacted(Schema.Unknown),
}) {}

/** Account deletion would leave these organizations, which have other members, without an owner. */
class OwnerRequired extends Schema.TaggedError<OwnerRequired>()("AuthProvider.OwnerRequired", {
  organizations: Schema.Array(Schema.String),
}) {}

export interface Interface {
  readonly signup: SignupMode;
  readonly authenticate: (headers: Headers) => Effect.Effect<Principal | null, Unavailable>;
  readonly handle: (
    request: Request,
    clientAddress: string,
  ) => Effect.Effect<Response, Unavailable>;
}

export class Service extends Context.Service<Service, Interface>()("@moku/web/AuthProvider") {}

export const layer = Layer.effectContext(
  Effect.gen(function* () {
    const database = yield* AuthStorage.Service;
    const origin = yield* Config.schema(Origin, "ORIGIN");
    const secret = yield* Config.redacted("BETTER_AUTH_SECRET");
    const signup = yield* Config.schema(SignupMode, "SIGNUP_MODE").pipe(
      Config.withDefault("invite-only"),
    );
    const allowedEmails = new Set(
      (yield* Config.schema(Config.Array(Schema.String), "SIGNUP_EMAILS").pipe(
        Config.withDefault([]),
      )).map((address) => address.trim().toLowerCase()),
    );
    const email = yield* Email.Service;
    const runPromise = Effect.runPromiseWith(yield* Effect.context<never>());
    const send = (to: string, subject: string, text: string) =>
      runPromise(
        email.send({ to, subject, text: Redacted.make(text) }).pipe(
          // Better Auth catches some send failures; its disabled logger cannot report them.
          Effect.tapCause(() => Effect.logError("email.send.failed")),
        ),
      );

    const auth = betterAuth({
      ...betterAuthOptions,
      plugins: [
        organizationPlugin({
          sendInvitationEmail: ({ id, role, email, organization, inviter }) =>
            send(
              email,
              `Join ${organization.name} on Moku`,
              `${new URL(`/invitations/${encodeURIComponent(id)}`, origin).href}\n\n${inviter.user.name} invited you to join ${organization.name} on Moku as ${role}.`,
            ),
        }),
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
      databaseHooks: {
        user: {
          create: {
            before: ({ email }): Promise<void> =>
              signup === "public" || allowedEmails.has(email)
                ? Promise.resolve()
                : runPromise(
                    Effect.result(
                      invited(email).pipe(
                        // Omits the address: operators match the attempt by its time.
                        Effect.tap((invited) =>
                          invited ? Effect.void : Effect.logInfo("signup.not_invited"),
                        ),
                        Effect.tapCause(() => Effect.logError("signup.invitations.failed")),
                      ),
                    ),
                  ).then(
                    Result.match({
                      onSuccess: (invited) => {
                        // Sign-up answers a 403 like a taken email, so no one learns who is invited.
                        if (!invited)
                          throw APIError.from("FORBIDDEN", {
                            code: "INVITATION_REQUIRED",
                            message: "Only invited emails can sign up.",
                          });
                      },
                      // Sign-up turns other errors into a 422 that blames the input.
                      onFailure: () => {
                        throw APIError.fromStatus("INTERNAL_SERVER_ERROR");
                      },
                    }),
                  ),
          },
        },
      },
      user: {
        deleteUser: {
          enabled: true,
          beforeDelete: (user, request): Promise<void> =>
            Effect.runPromise(
              Effect.result(
                releaseOrganizations(UserId.make(user.id), request?.headers ?? new Headers()),
              ),
            ).then(
              Result.match({
                onSuccess: () => undefined,
                onFailure: (failure) => {
                  throw failure._tag === "AuthProvider.OwnerRequired"
                    ? APIError.from("BAD_REQUEST", {
                        code: "ORGANIZATION_OWNER_REQUIRED",
                        message: `Make someone else an owner of ${new Intl.ListFormat("en").format(failure.organizations)} first.`,
                      })
                    : failure;
                },
              }),
            ),
        },
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

    const organizationsUnavailable = (cause: unknown) =>
      new Organizations.Unavailable({ cause: Redacted.make(cause) });

    const outsiderOrUnavailable = (cause: unknown) =>
      isAPIError(cause) && cause.body?.code === "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION"
        ? new Access.NotFound({})
        : organizationsUnavailable(cause);

    const role = Effect.fn("Organizations.role")(function* (
      headers: Headers,
      organizationId: OrganizationId,
    ) {
      const result: unknown = yield* Effect.tryPromise({
        try: () => auth.api.getActiveMemberRole({ headers, query: { organizationId } }),
        catch: outsiderOrUnavailable,
      });
      const provided = yield* Schema.decodeUnknownEffect(ProviderRole)(result).pipe(
        Effect.mapError(organizationsUnavailable),
      );

      return provided.role;
    });

    const list = Effect.fn("Organizations.list")(function* (headers: Headers) {
      const result: unknown = yield* Effect.tryPromise({
        try: () => auth.api.listOrganizations({ headers }),
        catch: organizationsUnavailable,
      });
      const organizations = yield* Schema.decodeUnknownEffect(Schema.Array(Organization))(
        result,
      ).pipe(Effect.mapError(organizationsUnavailable));

      return [...organizations].sort(
        Order.mapInput(Order.String, (organization: Organization) => organization.id),
      );
    });

    const listMembers = Effect.fn("Organizations.listMembers")(function* (
      headers: Headers,
      organizationId: OrganizationId,
    ) {
      const result: unknown = yield* Effect.tryPromise({
        try: () => auth.api.listMembers({ headers, query: { organizationId } }),
        catch: outsiderOrUnavailable,
      });
      const { members } = yield* Schema.decodeUnknownEffect(ProviderMembers)(result).pipe(
        Effect.mapError(organizationsUnavailable),
      );

      return members
        .map(({ id, userId, role, user }) => ({ id, userId, role, ...user }))
        .sort(memberOrder);
    });

    const create = Effect.fn("Organizations.create")(function* (
      headers: Headers,
      { name }: Organizations.CreateInput,
    ) {
      const result: unknown = yield* Effect.tryPromise({
        try: () =>
          auth.api.createOrganization({
            headers,
            body: { name, slug: generateId(), keepCurrentActiveOrganization: true },
          }),
        catch: organizationsUnavailable,
      });

      return yield* Schema.decodeUnknownEffect(Organization)(result).pipe(
        Effect.mapError(organizationsUnavailable),
      );
    });

    const inviteFailure = (cause: unknown) => {
      switch (isAPIError(cause) ? cause.body?.code : undefined) {
        case "MEMBER_NOT_FOUND":
          return new Access.NotFound({});
        case "YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION":
          return new Access.Denied({});
        case "YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE":
          return new Organizations.RoleNotAllowed({});
        case "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION":
          return new Organizations.AlreadyMember({});
        case "INVITATION_LIMIT_REACHED":
          return new Organizations.InvitationLimit({});
        default:
          return organizationsUnavailable(cause);
      }
    };

    const invite = Effect.fn("Organizations.invite")(function* (
      headers: Headers,
      organizationId: OrganizationId,
      { email, role }: Organizations.InviteInput,
    ) {
      yield* Effect.tryPromise({
        try: () =>
          auth.api.createInvitation({
            headers,
            body: { organizationId, email, role, resend: true },
          }),
        catch: inviteFailure,
      });
    });

    const changeRole = Effect.fn("Organizations.changeRole")(function* (
      headers: Headers,
      organizationId: OrganizationId,
      memberId: string,
      role: OrganizationRole,
    ) {
      yield* Effect.tryPromise({
        try: () => auth.api.updateMemberRole({ headers, body: { organizationId, memberId, role } }),
        catch: (cause) => {
          switch (isAPIError(cause) ? cause.body?.code : undefined) {
            case "MEMBER_NOT_FOUND":
              return new Organizations.MemberNotFound({});
            // Better Auth's answer both to roles without member updates and to admins changing owners.
            case "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER":
              return new Organizations.RoleNotAllowed({});
            case "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER":
              return new Organizations.LastOwner({});
            default:
              return organizationsUnavailable(cause);
          }
        },
      });
    });

    const removeMember = Effect.fn("Organizations.removeMember")(function* (
      headers: Headers,
      organizationId: OrganizationId,
      memberId: string,
    ) {
      yield* Effect.tryPromise({
        try: () =>
          auth.api.removeMember({ headers, body: { organizationId, memberIdOrEmail: memberId } }),
        catch: (cause) => {
          switch (isAPIError(cause) ? cause.body?.code : undefined) {
            case "MEMBER_NOT_FOUND":
              return new Organizations.MemberNotFound({});
            // Better Auth checks owners first, so admins removing owners get the only-owner code.
            case "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER":
            case "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER":
              return new Organizations.RemovalNotAllowed({});
            default:
              return organizationsUnavailable(cause);
          }
        },
      });
    });

    const deleteOrganization = Effect.fn("Organizations.delete")(function* (
      headers: Headers,
      organizationId: OrganizationId,
    ) {
      yield* Effect.tryPromise({
        try: () => auth.api.deleteOrganization({ headers, body: { organizationId } }),
        catch: (cause) => {
          switch (isAPIError(cause) ? cause.body?.code : undefined) {
            case "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION":
              return new Access.NotFound({});
            case "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION":
              return new Access.Denied({});
            default:
              return organizationsUnavailable(cause);
          }
        },
      });
    });

    /** Better Auth deletes the user's memberships, so first keep every organization they own alone:
     * refuse while one has other members, then delete the ones only they belong to. */
    const releaseOrganizations = Effect.fn("AuthProvider.releaseOrganizations")(function* (
      userId: UserId,
      headers: Headers,
    ) {
      const members = (query: {
        organizationId: OrganizationId;
        limit: number;
        filterField?: "role";
        filterValue?: "owner";
      }) =>
        Effect.tryPromise({
          try: () => auth.api.listMembers({ headers, query }),
          catch: organizationsUnavailable,
        }).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(ProviderMemberTotal)),
          Effect.mapError(organizationsUnavailable),
        );
      const ownedAlone = yield* Effect.filter(yield* list(headers), ({ id }) =>
        members({ organizationId: id, limit: 2, filterField: "role", filterValue: "owner" }).pipe(
          Effect.map(({ members, total }) => total === 1 && members[0]?.userId === userId),
        ),
      );
      const shared = yield* Effect.filter(ownedAlone, ({ id }) =>
        members({ organizationId: id, limit: 1 }).pipe(Effect.map(({ total }) => total > 1)),
      );
      if (shared.length > 0)
        return yield* new OwnerRequired({ organizations: shared.map(({ name }) => name) });

      yield* Effect.forEach(ownedAlone, ({ id }) => deleteOrganization(headers, id), {
        discard: true,
      });
    });

    /** Better Auth lists only pending invitations, but keeps expired ones pending. */
    const invited = Effect.fn("AuthProvider.invited")(function* (email: string) {
      const result: unknown = yield* Effect.tryPromise({
        try: () => auth.api.listUserInvitations({ query: { email } }),
        catch: unavailable,
      });
      const invitations = yield* Schema.decodeUnknownEffect(ProviderInvitations)(result).pipe(
        Effect.mapError(unavailable),
      );
      const now = yield* Clock.currentTimeMillis;

      return invitations.some(({ expiresAt }) => expiresAt.getTime() > now);
    });

    const invitationFailure = (cause: unknown) => {
      if (!isAPIError(cause)) return organizationsUnavailable(cause);
      // Better Auth answers every expired, cancelled, accepted, or unknown invitation with 400.
      return cause.status === "BAD_REQUEST" ||
        cause.body?.code === "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION"
        ? new Organizations.InvitationInvalid({})
        : organizationsUnavailable(cause);
    };

    const getInvitation = Effect.fn("Organizations.getInvitation")(function* (
      headers: Headers,
      invitationId: string,
    ) {
      const result: unknown = yield* Effect.tryPromise({
        try: () => auth.api.getInvitation({ headers, query: { id: invitationId } }),
        catch: invitationFailure,
      });

      return yield* Schema.decodeUnknownEffect(Organizations.Invitation)(result).pipe(
        Effect.mapError(organizationsUnavailable),
      );
    });

    const acceptInvitation = Effect.fn("Organizations.acceptInvitation")(function* (
      headers: Headers,
      invitationId: string,
    ) {
      const result: unknown = yield* Effect.tryPromise({
        try: () => auth.api.acceptInvitation({ headers, body: { invitationId } }),
        catch: invitationFailure,
      });
      const { member } = yield* Schema.decodeUnknownEffect(ProviderAcceptance)(result).pipe(
        Effect.mapError(organizationsUnavailable),
      );

      return member.organizationId;
    });

    const listInvitations = Effect.fn("Organizations.listInvitations")(function* (
      headers: Headers,
      organizationId: OrganizationId,
    ) {
      const result: unknown = yield* Effect.tryPromise({
        try: () => auth.api.listInvitations({ headers, query: { organizationId } }),
        // Better Auth rejects outsiders with a bare 403.
        catch: (cause) =>
          isAPIError(cause) && cause.status === "FORBIDDEN"
            ? new Access.NotFound({})
            : organizationsUnavailable(cause),
      });
      const invitations = yield* Schema.decodeUnknownEffect(ProviderInvitations)(result).pipe(
        Effect.mapError(organizationsUnavailable),
      );
      const now = yield* Clock.currentTimeMillis;

      return invitations
        .filter(({ status, expiresAt }) => status === "pending" && expiresAt.getTime() > now)
        .map(({ id, email, role }) => ({ id, email, role }))
        .sort((a, b) => Order.String(a.email, b.email));
    });

    const cancelInvitation = Effect.fn("Organizations.cancelInvitation")(function* (
      headers: Headers,
      invitationId: string,
    ) {
      yield* Effect.tryPromise({
        try: () => auth.api.cancelInvitation({ headers, body: { invitationId } }),
        catch: (cause) => {
          switch (isAPIError(cause) ? cause.body?.code : undefined) {
            case "INVITATION_NOT_FOUND":
              return new Organizations.InvitationInvalid({});
            case "MEMBER_NOT_FOUND":
              return new Access.NotFound({});
            case "YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION":
              return new Access.Denied({});
            default:
              return organizationsUnavailable(cause);
          }
        },
      });
    });

    return Context.make(Service, { signup, authenticate, handle }).pipe(
      Context.add(Organizations.Service, {
        role,
        list,
        listMembers,
        create,
        invite,
        changeRole,
        removeMember,
        delete: deleteOrganization,
        getInvitation,
        acceptInvitation,
        listInvitations,
        cancelInvitation,
      }),
    );
  }),
);

export * as AuthProvider from "./auth-provider.ts";
