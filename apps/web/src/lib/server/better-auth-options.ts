import type { BetterAuthOptions } from "better-auth";

export const betterAuthOptions = {
  emailAndPassword: { enabled: true, disableSignUp: true, requireEmailVerification: true },
  session: { expiresIn: 604800, disableSessionRefresh: true, cookieCache: { enabled: false } },
  logger: { disabled: true },
  onAPIError: { throw: true },
  advanced: { ipAddress: { ipAddressHeaders: ["x-moku-client-ip"] } },
} satisfies BetterAuthOptions;
