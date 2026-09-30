import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth/minimal";
import { drizzle } from "drizzle-orm/node-postgres";
import { betterAuthOptions } from "./src/lib/server/better-auth-options.ts";

/** CLI-only instance; schema generation never connects to a database. */
export const auth = betterAuth({
  ...betterAuthOptions,
  baseURL: "http://localhost:5173",
  database: drizzleAdapter(drizzle.mock(), { provider: "pg" }),
  secret: "schema-generation-only-secret-value",
});
