import type { BetterAuthOptions } from "better-auth";

export const betterAuthOptions = {
  emailAndPassword: { enabled: true, disableSignUp: true, requireEmailVerification: true },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    disableSessionRefresh: true,
    cookieCache: { enabled: false },
  },
} satisfies BetterAuthOptions;
