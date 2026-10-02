import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { HumanTaskDirectory } from "@moku/core/human-task-directory";
import { PersistencePostgres } from "@moku/database-postgres";
import { PostgresConnection } from "@moku/database-postgres/postgres-connection";
import { Effect, Layer, ManagedRuntime, type Redacted } from "effect";
import { Observability } from "./observability.ts";
import { RequestRunner } from "./request-runner.ts";
import { Authentication } from "./authentication.ts";

const postgres = (url: Redacted.Redacted) =>
  PostgresConnection.layer({ url, applicationName: "moku-web", maxConnections: 10 });

const application = HumanTaskDirectory.layer.pipe(
  Layer.provide(Layer.merge(PersistencePostgres.layer, NodeCrypto.layer)),
);

export const layer = (url: Redacted.Redacted) => application.pipe(Layer.provide(postgres(url)));

export const make = (url: Redacted.Redacted, settings: Observability.Settings = {}) =>
  ManagedRuntime.make(
    Layer.merge(application, Authentication.layer).pipe(
      Layer.provide(postgres(url)),
      Layer.provideMerge(Observability.layer(settings)),
    ),
  );

export type Runtime = ReturnType<typeof make>;

export const request = (runtime: Runtime, request: Request, clientAddress: string) => {
  // Overwrite caller input with Kit's transport address before provider rate limiting.
  request.headers.set("x-moku-client-ip", clientAddress);
  return runtime
    .runPromise(Authentication.Factory.use((bind) => bind(request)))
    .then((authentication) => {
      const run = RequestRunner.make(runtime, request.signal);
      return <A, E extends { readonly _tag: string }>(
        name: string,
        program: Effect.Effect<A, E, HumanTaskDirectory.Service | Authentication.Service>,
      ) => run(name, program.pipe(Effect.provideService(Authentication.Service, authentication)));
    });
};

export type Run = Awaited<ReturnType<typeof request>>;

export * as WebRuntime from "./runtime.ts";
