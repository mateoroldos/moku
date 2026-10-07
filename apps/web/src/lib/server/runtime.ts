import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { HumanTasks } from "@moku/core/human-tasks";
import { OrganizationAccess } from "@moku/core/organization-access";
import { Organizations } from "@moku/core/organizations";
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

    if (delivery === "console") return EmailConsole.layer;

    const accountId = yield* Config.schema(Schema.NonEmptyString, "CLOUDFLARE_ACCOUNT_ID");
    const token = yield* Config.redacted("CLOUDFLARE_API_TOKEN");
    const from = yield* Config.schema(Schema.NonEmptyString, "EMAIL_FROM");

    return EmailCloudflare.layer({ accountId, token, from }).pipe(
      Layer.provide(FetchHttpClient.layer),
    );
  }),
);

const postgres = (url: Redacted.Redacted) =>
  PostgresConnection.layer({
    url,
    applicationName: "moku-web",
    maxConnections: 10,
  });

const application = Layer.mergeAll(
  HumanTasks.layer,
  Organizations.layer,
  OrganizationAccess.layer,
).pipe(Layer.provide(PersistencePostgres.layer), Layer.provide(NodeCrypto.layer));

export const layer = (url: Redacted.Redacted) =>
  application.pipe(
    Layer.provideMerge(AuthProvider.layer),
    Layer.provide(email),
    Layer.provide(postgres(url)),
  );

export const make = (url: Redacted.Redacted, settings: Observability.Settings = {}) =>
  ManagedRuntime.make(layer(url).pipe(Layer.provideMerge(Observability.layer(settings))));

export type Runtime = ReturnType<typeof make>;
export type Run = ReturnType<
  typeof RequestRunner.make<
    ManagedRuntime.ManagedRuntime.Services<Runtime>,
    ManagedRuntime.ManagedRuntime.Error<Runtime>
  >
>;

export * as WebRuntime from "./runtime.ts";
