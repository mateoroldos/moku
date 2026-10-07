import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { HumanTaskDirectory } from "@moku/core/human-task-directory";
import { OrganizationAccess } from "@moku/core/organization-access";
import { PersistencePostgres } from "@moku/database-postgres";
import { PostgresConnection } from "@moku/database-postgres/postgres-connection";
import { EmailCloudflare } from "@moku/email-cloudflare";
import { Config, Effect, Layer, ManagedRuntime, type Redacted, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { Observability } from "./observability.ts";
import { RequestRunner } from "./request-runner.ts";
import { AuthProvider } from "./auth-provider.ts";
import { EmailConsole } from "./email-console.ts";

const email = Layer.unwrap(
  Effect.gen(function* () {
    const delivery = yield* Config.schema(
      Schema.Literals(["cloudflare", "console"]),
      "EMAIL_DELIVERY",
    ).pipe(Config.withDefault("cloudflare"));

    return delivery === "console"
      ? EmailConsole.layer
      : EmailCloudflare.layer.pipe(Layer.provide(FetchHttpClient.layer));
  }),
);

const postgres = (url: Redacted.Redacted) =>
  PostgresConnection.layer({
    url,
    applicationName: "moku-web",
    maxConnections: 10,
  });

const application = Layer.merge(HumanTaskDirectory.layer, OrganizationAccess.layer).pipe(
  Layer.provideMerge(PersistencePostgres.layer),
  Layer.provide(NodeCrypto.layer),
);

export const layer = (url: Redacted.Redacted) => application.pipe(Layer.provide(postgres(url)));

export const make = (url: Redacted.Redacted, settings: Observability.Settings = {}) =>
  ManagedRuntime.make(
    Layer.merge(application, AuthProvider.layer).pipe(
      Layer.provide(email),
      Layer.provide(postgres(url)),
      Layer.provideMerge(Observability.layer(settings)),
    ),
  );

export type Runtime = ReturnType<typeof make>;
export type Run = ReturnType<
  typeof RequestRunner.make<
    ManagedRuntime.ManagedRuntime.Services<Runtime>,
    ManagedRuntime.ManagedRuntime.Error<Runtime>
  >
>;

export * as WebRuntime from "./runtime.ts";
