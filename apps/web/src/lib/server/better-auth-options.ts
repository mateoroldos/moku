import type { BetterAuthOptions } from "better-auth";

export const betterAuthOptions = {
  emailAndPassword: { enabled: true, disableSignUp: true },
} satisfies BetterAuthOptions;
