import { type EffectPgDatabase, makeWithDefaults } from "drizzle-orm/effect-postgres";
import { Context, Layer } from "effect";

export class Service extends Context.Service<Service, EffectPgDatabase>()(
  "@moku/database-postgres/internal/Database",
) {}

export const layer = Layer.effect(Service, makeWithDefaults());

export * as Database from "./database.ts";
