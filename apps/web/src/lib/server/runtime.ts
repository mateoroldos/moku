import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { HumanTaskDirectory } from "@moku/core/human-task-directory";
import { PersistencePostgres } from "@moku/database-postgres";
import * as authSchema from "@moku/database-postgres/auth-schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { Effect, Layer, ManagedRuntime, type Redacted } from "effect";
import type { AuthConfig } from "./auth-config.ts";
import { Authentication } from "./authentication.ts";
import { Observability } from "./observability.ts";
import { Postgres } from "./postgres.ts";
import { RequestRunner } from "./request-runner.ts";

const application = HumanTaskDirectory.layer.pipe(
  Layer.provide(Layer.merge(PersistencePostgres.layer, NodeCrypto.layer)),
);

const layer = (
  url: Redacted.Redacted,
  auth: AuthConfig.Settings,
  settings: Observability.Settings,
) => {
  const authentication = Layer.effect(
    Authentication.Service,
    Effect.gen(function* () {
      const pool = yield* Postgres.Pool;
      return Authentication.make(
        drizzle({ client: pool, relations: { ...authSchema.authRelations } }),
        auth,
      );
    }),
  );
  return Layer.merge(application, authentication).pipe(
    Layer.provide(Postgres.layer(url)),
    Layer.provideMerge(Observability.layer(settings)),
  );
};

export const make = (
  url: Redacted.Redacted,
  auth: AuthConfig.Settings,
  settings: Observability.Settings = {},
) => ManagedRuntime.make(layer(url, auth, settings));

export type Runtime = ReturnType<typeof make>;
export type Run = ReturnType<
  typeof RequestRunner.make<
    ManagedRuntime.ManagedRuntime.Services<Runtime>,
    ManagedRuntime.ManagedRuntime.Error<Runtime>
  >
>;

export * as WebRuntime from "./runtime.ts";
