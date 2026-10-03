import type { BetterAuthOptions } from "better-auth";
import { organization } from "better-auth/plugins/organization";

const organizations = organization({ allowUserToCreateOrganization: false });

export const betterAuthOptions = {
  plugins: [
    {
      ...organizations,
      schema: {
        ...organizations.schema,
        member: {
          ...organizations.schema.member,
          indexes: [{ fields: ["organizationId", "userId"], unique: true }],
        },
      },
    },
  ],
  emailAndPassword: { enabled: true, disableSignUp: true, requireEmailVerification: true },
  session: { expiresIn: 604800, disableSessionRefresh: true, cookieCache: { enabled: false } },
  logger: { disabled: true },
  onAPIError: { throw: true },
  advanced: { ipAddress: { ipAddressHeaders: ["x-moku-client-ip"] } },
} satisfies BetterAuthOptions;
