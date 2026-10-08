import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { HumanTasks } from "@moku/core/human-tasks";
import { AuthStorage } from "@moku/database-postgres/auth-storage";
import { PersistencePostgres } from "@moku/database-postgres";
import { PostgresConnection } from "@moku/database-postgres/postgres-connection";
import { ApprovalResult } from "@moku/domain/human-task";
import { Principal } from "@moku/domain/identity";
import { Membership, OrganizationId, OrganizationRole } from "@moku/domain/organization";
import { betterAuth } from "better-auth/minimal";
import { Config, Console, Effect, Layer, Redacted, Schema } from "effect";
import { betterAuthOptions } from "#lib/server/better-auth-options.ts";

class SeedUnavailable extends Schema.TaggedError<SeedUnavailable>()("SeedUnavailable", {
  cause: Schema.Redacted(Schema.Unknown),
}) {}

const provider = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new SeedUnavailable({ cause: Redacted.make(cause) }),
  });

const provisionAccount = Effect.fn("provisionAccount")(function* () {
  const database = yield* AuthStorage.Service;
  const email = (yield* Config.schema(
    Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
    "SEED_EMAIL",
  )).toLowerCase();
  const password = yield* Config.redacted("SEED_PASSWORD");
  const secret = yield* Config.redacted("BETTER_AUTH_SECRET");
  const slug = yield* Config.string("SEED_ORGANIZATION_SLUG").pipe(Config.withDefault("moku"));

  const auth = betterAuth({
    ...betterAuthOptions,
    database,
    secret: Redacted.value(secret),
    baseURL: "http://localhost",
  });
  const context = yield* provider(() => auth.$context);

  const existing = yield* provider(() =>
    context.internalAdapter.findUserByEmail(email, { includeAccounts: true }),
  );
  const user =
    existing?.user ??
    (yield* provider(() =>
      context.internalAdapter.createUser(
        { email, name: email, emailVerified: true },
        { method: "email-password" },
      ),
    ));

  if (!existing?.accounts.some((account) => account.providerId === "credential")) {
    const hash = yield* provider(() => context.password.hash(Redacted.value(password)));
    yield* provider(() =>
      context.internalAdapter.linkAccount({
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: hash,
      }),
    );
  }

  const verifiedUser = user.emailVerified
    ? user
    : yield* provider(() => context.internalAdapter.updateUser(user.id, { emailVerified: true }));
  const principal = yield* Schema.decodeEffect(Principal)({
    userId: verifiedUser.id,
    emailVerified: verifiedUser.emailVerified,
  });

  const organizations = yield* provider(() =>
    context.adapter.findMany({ model: "organization", where: [{ field: "slug", value: slug }] }),
  );
  const existingOrganization = yield* Schema.decodeUnknownEffect(
    Schema.Array(Schema.Struct({ id: Schema.String })),
  )(organizations);
  const organizationId = yield* Schema.decodeEffect(OrganizationId)(
    existingOrganization[0]?.id ??
      (yield* provider(() =>
        auth.api.createOrganization({ body: { name: slug, slug, userId: principal.userId } }),
      )).id,
  );

  const members = yield* provider(() =>
    context.adapter.findMany({
      model: "member",
      where: [
        { field: "organizationId", value: organizationId },
        { field: "userId", value: principal.userId },
      ],
    }),
  );
  const [stored] = yield* Schema.decodeUnknownEffect(
    Schema.Array(Schema.Struct({ role: OrganizationRole })),
  )(members);
  if (stored === undefined)
    yield* provider(() =>
      auth.api.addMember({
        body: { organizationId, userId: principal.userId, role: "owner" },
      }),
    );

  return Membership.make({
    userId: principal.userId,
    organizationId,
    role: stored?.role ?? "owner",
  });
}, Effect.uninterruptible);

const examples = Schema.decodeSync(
  Schema.Array(
    Schema.Struct({
      request: HumanTasks.CreateInput,
      result: Schema.optionalKey(ApprovalResult),
    }),
  ),
)([
  {
    request: {
      intent: "authorize",
      subject: {
        title: "Authorize a paper-trading order",
        description:
          "Buy 10 shares of ACME in the paper-trading account.\nLimit price: $125 per share. Maximum simulated exposure: $1,250.",
      },
      context:
        "The strategy proposes this position after its daily rebalance. Check the quantity and exposure before authorizing. This is a simulation; no real money will move.",
      response: { type: "approval" },
    },
  },
  {
    request: {
      intent: "authorize",
      subject: { title: "Authorize publication of the weekly report" },
      response: { type: "approval" },
    },
  },
  {
    request: {
      intent: "authorize",
      subject: {
        title: "Send the release summary to the team",
        description:
          "Send the reviewed summary to the internal engineering channel. The message contains release notes and a link to the deployment checklist.",
      },
      response: { type: "approval" },
    },
    result: { decision: "approved", feedback: "The summary matches the reviewed release notes." },
  },
  {
    request: {
      intent: "authorize",
      subject: {
        title: "Publish the customer case study",
        description:
          "Publish the draft case study on the public website, including the customer's name and performance figures.",
      },
      context:
        "The draft has been edited, but written permission to use the customer’s name has not been attached.",
      response: { type: "approval" },
    },
    result: {
      decision: "rejected",
      feedback: "Obtain the customer's written permission before requesting publication again.",
    },
  },
]);

NodeRuntime.runMain(
  Effect.gen(function* () {
    const baseUrl = process.argv.includes("--account-only")
      ? undefined
      : yield* Config.url("REVIEW_BASE_URL").pipe(
          Config.withDefault(new URL("http://localhost:5173")),
        );

    const membership = yield* provisionAccount();
    yield* Console.log(
      `Verified login account ready.\nUser: ${membership.userId}\nOrganization: ${membership.organizationId}`,
    );

    if (baseUrl === undefined) return;

    const humanTasks = yield* HumanTasks.Service;

    for (const { request, result } of examples) {
      const pending = yield* humanTasks.create(membership, request);
      const task =
        result === undefined ? pending : yield* humanTasks.respond(membership, pending.id, result);

      yield* Console.log(
        `${task.status === "pending" ? "pending" : task.result.decision} · ${task.subject.title}\n${new URL(`/org/${encodeURIComponent(membership.organizationId)}/tasks/${task.id}`, baseUrl).href}`,
      );
    }

    yield* Console.log("Added four example tasks. Existing tasks and decisions were preserved.");
  }).pipe(
    Effect.provide(
      Layer.unwrap(
        Config.redacted("DATABASE_URL").pipe(
          Effect.map((url) =>
            HumanTasks.layer.pipe(
              Layer.provide(PersistencePostgres.layer),
              Layer.provide(NodeCrypto.layer),
              Layer.provideMerge(
                PostgresConnection.layer({ url, applicationName: "moku-seed", maxConnections: 1 }),
              ),
            ),
          ),
        ),
      ),
    ),
  ),
);
