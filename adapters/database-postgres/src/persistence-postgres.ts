import { Layer } from "effect";
import { type CustomTypesConfig, types } from "pg";
import { HumanTaskStorePostgres } from "./human-task/human-task-store-postgres.ts";
import { Database } from "./internal/database.ts";

const drizzleRawStringOids = new Set([1082, 1114, 1184, 1186, 1231, 1115, 1185, 1187, 1182]);

/** Drizzle's Effect codecs own temporal decoding, rather than node-postgres. */
export const typeParsers: CustomTypesConfig = {
  getTypeParser: (oid, format) =>
    drizzleRawStringOids.has(oid) ? (value: string) => value : types.getTypeParser(oid, format),
};

export const layer = HumanTaskStorePostgres.layer.pipe(Layer.provide(Database.layer));

export * as PersistencePostgres from "./persistence-postgres.ts";
