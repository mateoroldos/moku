import { PgClient } from "@effect/sql-pg";
import { PersistencePostgres } from "@moku/database-postgres";
import { Context, Effect, Layer, Redacted, Schema } from "effect";
import Pg from "pg";

export class Pool extends Context.Service<Pool, Pg.Pool>()("@moku/web/Postgres.Pool") {}

export class Unavailable extends Schema.TaggedError<Unavailable>()("Postgres.Unavailable", {
  cause: Schema.Defect(),
}) {}

export const layer = (url: Redacted.Redacted<string>) => {
  const pool = Layer.effect(
    Pool,
    Effect.gen(function* () {
      const resource = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const value = new Pg.Pool({
            connectionString: Redacted.value(url),
            types: PersistencePostgres.typeParsers,
            application_name: "moku-web",
            connectionTimeoutMillis: 5000,
            max: 10,
          });
          // pg removes failed idle clients; an error listener prevents process termination.
          value.on("error", () => {});
          return value;
        }),
        (value) => Effect.promise(() => value.end()),
      );
      yield* Effect.tryPromise({
        try: () => resource.query("SELECT 1"),
        catch: (cause) => new Unavailable({ cause }),
      });
      return resource;
    }),
  );
  return Layer.unwrap(
    Pool.use((value) =>
      Effect.succeed(PgClient.layerFrom(PgClient.fromPool({ acquire: Effect.succeed(value) }))),
    ),
  ).pipe(Layer.provideMerge(pool));
};

export * as Postgres from "./postgres.ts";
