import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { AuthStorage } from "@moku/database-postgres/auth-storage";
import { PostgresConnection } from "@moku/database-postgres/postgres-connection";
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

NodeRuntime.runMain(
  Effect.gen(function* () {
    const database = yield* AuthStorage.Service;
    const email = (yield* Config.schema(
      Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
      "SEED_EMAIL",
    )).toLowerCase();
    const password = yield* Config.redacted("SEED_PASSWORD");
    const secret = yield* Config.redacted("BETTER_AUTH_SECRET");
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
    if (!user.emailVerified)
      yield* provider(() => context.internalAdapter.updateUser(user.id, { emailVerified: true }));
    yield* Console.log("Verified login account ready. Existing credentials were preserved.");
  }).pipe(
    Effect.uninterruptible,
    Effect.provide(
      Layer.unwrap(
        Config.redacted("DATABASE_URL").pipe(
          Effect.map((url) =>
            PostgresConnection.layer({ url, applicationName: "moku-auth-seed", maxConnections: 1 }),
          ),
        ),
      ),
    ),
  ),
);
