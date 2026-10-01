import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth/minimal";
import { drizzle } from "drizzle-orm/node-postgres";
import { betterAuthOptions } from "./src/lib/server/better-auth-options.ts";

export const auth = betterAuth({
  ...betterAuthOptions,
  baseURL: "http://localhost:5173",
  database: drizzleAdapter(drizzle.mock(), { provider: "pg" }),
  advanced: { database: { validateSchema: false } },
});
