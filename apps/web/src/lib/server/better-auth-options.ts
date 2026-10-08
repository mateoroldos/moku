import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { generateId } from "@better-auth/core/utils/id";
import { organization, type OrganizationOptions } from "better-auth/plugins/organization";
import { defaultRoles, memberAc } from "better-auth/plugins/organization/access";
import { customAlphabet } from "nanoid";

// Better Auth rejects unknown roles; viewers manage nothing, like members.
export const organizationRoles = { ...defaultRoles, viewer: memberAc };

const organizationId = customAlphabet("0123456789ABCDEFGHJKMNPQRSTVWXYZ", 12);

export const organizationPlugin = (
  options: Pick<OrganizationOptions, "sendInvitationEmail"> = {},
) => {
  const plugin = organization({
    roles: organizationRoles,
    requireEmailVerificationOnInvitation: true,
    ...options,
  });

  return {
    ...plugin,
    schema: {
      ...plugin.schema,
      member: {
        ...plugin.schema.member,
        // The plugin omits this constraint; schema generation must enforce one membership per pair.
        indexes: [{ fields: ["organizationId", "userId"], unique: true }],
      },
    },
  } satisfies BetterAuthPlugin;
};

export const betterAuthOptions = {
  plugins: [organizationPlugin()],
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
