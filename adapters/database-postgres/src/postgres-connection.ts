import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { PgClient } from "@effect/sql-pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { Effect, Layer, Redacted } from "effect";
import { ConnectionError, SqlError } from "effect/unstable/sql/SqlError";
import { Pool } from "pg";
import { AuthStorage } from "./auth/auth-storage.ts";
import * as schema from "./auth/schema.ts";
import { PersistencePostgres } from "./persistence-postgres.ts";

export interface Options {
  readonly url: Redacted.Redacted;
  readonly applicationName: string;
  readonly maxConnections: number;
}

export const layer = (options: Options) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const pool = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const pool = new Pool({
            connectionString: Redacted.value(options.url),
            application_name: options.applicationName,
            max: options.maxConnections,
            connectionTimeoutMillis: 5000,
            types: PersistencePostgres.typeParsers,
          });
          // pg removes failed idle clients; operations report their own failures.
          pool.on("error", () => {});
          return pool;
        }),
        (pool) => Effect.promise(() => pool.end()),
      );
      yield* Effect.tryPromise({
        try: () => pool.query("SELECT 1"),
        catch: (cause) => new SqlError({ reason: new ConnectionError({ cause }) }),
      });
      return Layer.merge(
        PgClient.layerFrom(
          PgClient.fromPool({
            acquire: Effect.succeed(pool),
            types: PersistencePostgres.typeParsers,
          }),
        ),
        Layer.succeed(
          AuthStorage.Service,
          drizzleAdapter(drizzle({ client: pool, relations: schema.authRelations }), {
            provider: "pg",
            schema,
            transaction: true,
          }),
        ),
      );
    }),
  );

export * as PostgresConnection from "./postgres-connection.ts";
