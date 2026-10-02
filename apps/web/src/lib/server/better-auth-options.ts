import type { BetterAuthOptions } from "better-auth";
import { createAuthEndpoint, signOut } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";

export const betterAuthOptions = {
  emailAndPassword: { enabled: true, disableSignUp: true, requireEmailVerification: true },
  session: { expiresIn: 604800, disableSessionRefresh: true, cookieCache: { enabled: false } },
  logger: { disabled: true },
  onAPIError: { throw: true },
  advanced: { trustedProxyHeaders: false, ipAddress: { ipAddressHeaders: ["x-moku-client-ip"] } },
  plugins: [
    {
      id: "confirmed-signout",
      endpoints: {
        // The provider's signout swallows deletion failures; cookies must follow confirmed revocation.
        // oxlint-disable-next-line effecttsgo/async-function -- Better Auth owns endpoint validation, middleware and cookie signing.
        signOut: createAuthEndpoint("/sign-out", signOut.options, async (ctx) => {
          const token = await ctx.getSignedCookie(
            ctx.context.authCookies.sessionToken.name,
            ctx.context.secret,
          );
          if (token)
            await ctx.context.adapter.delete({
              model: "session",
              where: [{ field: "token", value: token }],
            });
          deleteSessionCookie(ctx);
          return ctx.json({ success: true });
        }),
      },
    },
  ],
} satisfies BetterAuthOptions;
