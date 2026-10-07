import type { BetterAuthOptions } from "better-auth";
import { generateId } from "@better-auth/core/utils/id";
import { organization } from "better-auth/plugins/organization";
import { customAlphabet } from "nanoid";

const organizations = organization({ allowUserToCreateOrganization: false });
const organizationId = customAlphabet("0123456789ABCDEFGHJKMNPQRSTVWXYZ", 12);

export const betterAuthOptions = {
  plugins: [
    {
      ...organizations,
      schema: {
        ...organizations.schema,
        member: {
          ...organizations.schema.member,
          // The plugin omits this constraint; schema generation must enforce one membership per pair.
          indexes: [{ fields: ["organizationId", "userId"], unique: true }],
        },
      },
    },
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
  },
  session: { expiresIn: 604800, disableSessionRefresh: true, cookieCache: { enabled: false } },
  logger: { disabled: true },
  onAPIError: { throw: true },
  advanced: {
    ipAddress: { ipAddressHeaders: ["x-moku-client-ip"] },
    database: {
      generateId: ({ model, size }) =>
        model === "organization" ? organizationId() : generateId(size),
    },
  },
} satisfies BetterAuthOptions;
