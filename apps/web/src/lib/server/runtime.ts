import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { HumanTaskDirectory } from "@moku/core/human-task-directory";
import { PersistencePostgres } from "@moku/database-postgres";
import { PostgresConnection } from "@moku/database-postgres/postgres-connection";
import { Layer, ManagedRuntime, type Redacted } from "effect";
import { Observability } from "./observability.ts";
import { RequestRunner } from "./request-runner.ts";

export const layer = (url: Redacted.Redacted) => {
  const postgres = PostgresConnection.layer({
    url,
    applicationName: "moku-web",
    maxConnections: 10,
  });
  const persistence = PersistencePostgres.layer.pipe(Layer.provide(postgres));
  return HumanTaskDirectory.layer.pipe(Layer.provide(Layer.merge(persistence, NodeCrypto.layer)));
};

export const make = (url: Redacted.Redacted, settings: Observability.Settings = {}) =>
  ManagedRuntime.make(layer(url).pipe(Layer.provideMerge(Observability.layer(settings))));

export type Runtime = ReturnType<typeof make>;
export type Run = ReturnType<
  typeof RequestRunner.make<
    HumanTaskDirectory.Service,
    ManagedRuntime.ManagedRuntime.Error<Runtime>
  >
>;

export * as WebRuntime from "./runtime.ts";
