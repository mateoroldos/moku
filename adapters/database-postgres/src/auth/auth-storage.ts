import type { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { Context } from "effect";

export class Service extends Context.Service<Service, ReturnType<typeof drizzleAdapter>>()(
  "@moku/database-postgres/AuthStorage",
) {}

export * as AuthStorage from "./auth-storage.ts";
