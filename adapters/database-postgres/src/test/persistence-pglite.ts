import { PgliteClient } from "@effect/sql-pglite";
import { makeWithDefaults } from "drizzle-orm/effect-pglite";
import { migrate } from "drizzle-orm/effect-pglite/migrator";
import { DateTime, Effect, Layer } from "effect";
import { HumanTaskStorePostgres } from "../human-task/human-task-store-postgres.ts";
import { Database } from "../internal/database.ts";
import { migrationConfig } from "../migrations.ts";
import { organization } from "../auth/schema.ts";

export const databaseLayer = Layer.effect(
  Database.Service,
  Effect.gen(function* () {
    const database = yield* makeWithDefaults();
    yield* migrate(database, migrationConfig);
    yield* database.insert(organization).values([
      {
        id: "test-org",
        name: "Test",
        slug: "test",
        createdAt: DateTime.toDateUtc(DateTime.makeUnsafe(0)),
      },
      {
        id: "other-org",
        name: "Other",
        slug: "other",
        createdAt: DateTime.toDateUtc(DateTime.makeUnsafe(0)),
      },
    ]);
    return database;
  }),
).pipe(Layer.provide(PgliteClient.layer()));

export const layer = HumanTaskStorePostgres.layer.pipe(Layer.provideMerge(databaseLayer));

export * as PersistencePglite from "./persistence-pglite.ts";
