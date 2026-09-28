import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { PgClient } from "@effect/sql-pg";
import { HumanTaskDirectory } from "@moku/core/human-task-directory";
import { PersistencePostgres } from "@moku/database-postgres";
import { Effect, Layer, ManagedRuntime, type Redacted } from "effect";

export const layer = (url: Redacted.Redacted) => {
  const postgres = PgClient.layer({
    url,
    types: PersistencePostgres.typeParsers,
    applicationName: "moku-web",
    connectTimeout: "5 seconds",
    maxConnections: 10,
  });
  const persistence = PersistencePostgres.layer.pipe(Layer.provide(postgres));
  return HumanTaskDirectory.layer.pipe(Layer.provide(Layer.merge(persistence, NodeCrypto.layer)));
};

export const make = (url: Redacted.Redacted) => ManagedRuntime.make(layer(url));

export type Runtime = ReturnType<typeof make>;
export type Run = <A, E>(program: Effect.Effect<A, E, HumanTaskDirectory.Service>) => Promise<A>;

export * as WebRuntime from "./runtime.ts";
