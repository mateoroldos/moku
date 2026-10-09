import type { OrganizationRole } from "@moku/domain/organization";

export const roleLabel = (role: OrganizationRole) => `${role[0]?.toUpperCase()}${role.slice(1)}`;
