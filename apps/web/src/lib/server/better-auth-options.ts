import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { apiKey } from "@better-auth/api-key";
import { generateId } from "@better-auth/core/utils/id";
import { createAccessControl } from "better-auth/plugins/access";
import { organization, type OrganizationOptions } from "better-auth/plugins/organization";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";
import { OrganizationRole } from "@moku/domain/organization";
import { customAlphabet } from "nanoid";

const keyManagement = { apiKey: ["create", "read", "delete"] } as const;
const ac = createAccessControl({ ...defaultStatements, ...keyManagement });

// Better Auth rejects unknown roles; viewers manage nothing, like members.
export const organizationRoles = {
  owner: ac.newRole({ ...ownerAc.statements, ...keyManagement }),
  admin: ac.newRole({ ...adminAc.statements, ...keyManagement }),
  member: memberAc,
  viewer: memberAc,
};

/** Roles a member may give, and the members they may manage; mirrors Better Auth's owner-only `creatorRole` checks. */
export const assignableRoles = (role: OrganizationRole): ReadonlyArray<OrganizationRole> =>
  role === "owner"
    ? OrganizationRole.literals
    : OrganizationRole.literals.filter((r) => r !== "owner");

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

export const apiKeyPlugin = () => {
  const plugin = apiKey({
    references: "organization",
    defaultPrefix: "moku_",
    // The prefix plus four characters identify a key in lists.
    startingCharactersConfig: { charactersLength: 9 },
    enableMetadata: true,
    rateLimit: { enabled: false },
    permissions: { defaultPermissions: { task: ["create", "read"] } },
  });

  return {
    ...plugin,
    schema: {
      apikey: {
        ...plugin.schema.apikey,
        fields: {
          ...plugin.schema.apikey.fields,
          // The plugin omits this constraint; an organization's keys go with it.
          referenceId: {
            ...plugin.schema.apikey.fields.referenceId,
            references: { model: "organization", field: "id", onDelete: "cascade" },
          },
        },
      },
    },
  } satisfies BetterAuthPlugin;
};

export const betterAuthOptions = {
  plugins: [organizationPlugin(), apiKeyPlugin()],
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
