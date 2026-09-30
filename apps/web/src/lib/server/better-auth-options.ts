import type { BetterAuthOptions } from "better-auth";

/** Shared by the running provider and its schema generator. */
export const betterAuthOptions = {
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    disableSessionRefresh: true,
    freshAge: 60 * 5,
    cookieCache: { enabled: false },
  },
  user: { deleteUser: { enabled: false } },
  rateLimit: { enabled: true, storage: "database" },
  advanced: {
    cookiePrefix: "moku",
    disableOriginCheck: false,
    disableCSRFCheck: false,
    // Proxy trust is deployment-specific; never accept arbitrary forwarded IPs.
    ipAddress: { ipAddressHeaders: [] },
  },
  logger: { disabled: true },
  telemetry: { enabled: false },
  experimental: { instrumentation: { enabled: false } },
} as const satisfies BetterAuthOptions;
