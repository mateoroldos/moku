import { PgliteClient } from "@effect/sql-pglite";
import { makeWithDefaults } from "drizzle-orm/effect-pglite";
import { migrate } from "drizzle-orm/effect-pglite/migrator";
import { Effect, Layer } from "effect";
import { HumanTaskStorePostgres } from "../human-task/human-task-store-postgres.ts";
import { Database } from "../internal/database.ts";
import { migrationConfig } from "../migrations.ts";

export const databaseLayer = Layer.effect(
  Database.Service,
  Effect.gen(function* () {
    const database = yield* makeWithDefaults();
    yield* migrate(database, migrationConfig);
    return database;
  }),
).pipe(Layer.provide(PgliteClient.layer()));

export const layer = HumanTaskStorePostgres.layer.pipe(Layer.provideMerge(databaseLayer));

export * as PersistencePglite from "./persistence-pglite.ts";
