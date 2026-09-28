import { fileURLToPath } from "node:url";

export const migrationConfig = {
  migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
};
