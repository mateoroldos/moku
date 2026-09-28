import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { PgClient } from "@effect/sql-pg";
import { makeWithDefaults } from "drizzle-orm/effect-postgres";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import { Config, Effect, Layer } from "effect";
import { migrationConfig } from "./migrations.ts";
import { PersistencePostgres } from "./persistence-postgres.ts";

const postgres = Layer.unwrap(
  Config.redacted("DATABASE_URL").pipe(
    Effect.map((url) => PgClient.layer({ url, types: PersistencePostgres.typeParsers })),
  ),
);

NodeRuntime.runMain(
  Effect.gen(function* () {
    const database = yield* makeWithDefaults();
    yield* migrate(database, migrationConfig);
    yield* Effect.logInfo("PostgreSQL migrations applied");
  }).pipe(Effect.provide(postgres)),
);
