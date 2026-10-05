import { PgClient } from "@effect/sql-pg";
import { assert, it } from "@effect/vitest";
import { betterAuth } from "better-auth/minimal";
import { makeWithDefaults } from "drizzle-orm/effect-postgres";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import { Config, DateTime, Deferred, Effect, Fiber, Layer, ManagedRuntime, Redacted } from "effect";
import { expect } from "vitest";
import { AuthStorage } from "../auth/auth-storage.ts";
import { migrationConfig } from "../migrations.ts";
import { PostgresConnection } from "../postgres-connection.ts";

it.live("fails connection-layer acquisition when PostgreSQL is unavailable", () =>
  Effect.gen(function* () {
    const failure = yield* Effect.flip(
      Effect.void.pipe(
        Effect.provide(
          PostgresConnection.layer({
            url: Redacted.make("postgresql://127.0.0.1:1/moku_unavailable"),
            applicationName: "moku-auth-unavailable-test",
            maxConnections: 1,
          }),
        ),
      ),
    );
    assert.strictEqual(failure.reason._tag, "ConnectionError");
  }),
);

const postgres = Layer.unwrap(
  Config.redacted("TEST_DATABASE_URL").pipe(
    Effect.map((url) =>
      PostgresConnection.layer({ url, applicationName: "moku-auth-test", maxConnections: 1 }),
    ),
  ),
);

const authentication = Effect.gen(function* () {
  yield* migrate(yield* makeWithDefaults(), migrationConfig);
  return betterAuth({
    database: yield* AuthStorage.Service,
    baseURL: "http://localhost:5173",
    secret: "integration-test-only-secret-01234567890123456789",
    emailAndPassword: { enabled: true, autoSignIn: false },
    logger: { disabled: true },
  });
});

const verification = {
  identifier: "shared-pool",
  value: "test-only-value",
  expiresAt: DateTime.toDateUtc(DateTime.makeUnsafe("2030-01-01T00:00:00Z")),
};

it.live(
  "round-trips auth on the Effect SQL connection and rolls back failed auth transactions",
  () =>
    Effect.gen(function* () {
      const auth = yield* authentication;
      const sql = yield* PgClient.PgClient;
      const cleanup = sql`DELETE FROM "user" WHERE email = 'auth-storage@example.test'`;
      yield* Effect.acquireRelease(cleanup, () => cleanup.pipe(Effect.orDie));
      const body = { email: "auth-storage@example.test", password: "test-only-password-12345" };
      const registered = yield* Effect.promise(() =>
        auth.api.signUpEmail({ body: { ...body, name: "Storage test" } }),
      );
      const response = yield* Effect.promise(() =>
        auth.api.signInEmail({ body, asResponse: true }),
      );
      assert.strictEqual(response.status, 200);
      const cookie = response.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      const headers = new Headers({ cookie });
      const identity = yield* Effect.promise(() => auth.api.getSession({ headers }));
      assert.strictEqual(identity?.user.id, registered.user.id);
      assert.instanceOf(identity?.session.expiresAt, Date);

      // Only this connection can see the temporary table; pool disposal removes it.
      yield* sql`CREATE TEMP TABLE verification (LIKE public.verification INCLUDING ALL)`;
      const { adapter } = yield* Effect.promise(() => auth.$context);
      yield* Effect.promise(() => adapter.create({ model: "verification", data: verification }));
      assert.deepStrictEqual(yield* sql`SELECT identifier FROM verification`, [
        { identifier: "shared-pool" },
      ]);
      yield* Effect.promise(() =>
        expect(
          adapter.transaction((tx) =>
            tx
              .create({ model: "verification", data: { ...verification, identifier: "rollback" } })
              .then(() => {
                throw new Error("rollback probe");
              }),
          ),
        ).rejects.toThrow("rollback probe"),
      );
      assert.deepStrictEqual(
        yield* sql`SELECT identifier FROM verification WHERE identifier = 'rollback'`,
        [],
      );

      return { auth, headers };
    }).pipe(
      Effect.scoped,
      Effect.provide(postgres),
      Effect.flatMap(({ auth, headers }) =>
        Effect.promise(() =>
          expect(auth.api.getSession({ headers })).rejects.toMatchObject({
            status: "INTERNAL_SERVER_ERROR",
          }),
        ),
      ),
    ),
);

it.live("drains a borrowed auth transaction before releasing the pool", () =>
  Effect.gen(function* () {
    const sql = yield* PgClient.PgClient;
    const runtime = yield* Effect.acquireRelease(
      Effect.sync(() => ManagedRuntime.make(postgres)),
      (runtime) => runtime.disposeEffect,
    );
    const auth = yield* Effect.promise(() => runtime.runPromise(authentication));
    const { adapter } = yield* Effect.promise(() => auth.$context);
    const cleanup = sql`DELETE FROM verification WHERE identifier = 'drain-pool'`;
    yield* Effect.acquireRelease(cleanup, () => cleanup.pipe(Effect.orDie));
    const started = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const runPromise = Effect.runPromiseWith(yield* Effect.context());

    const transaction = yield* Effect.acquireRelease(
      Effect.promise(() =>
        adapter.transaction((tx) =>
          runPromise(
            Effect.gen(function* () {
              yield* Effect.promise(() =>
                tx.create({
                  model: "verification",
                  data: { ...verification, identifier: "drain-pool" },
                }),
              );
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(release);
            }),
          ),
        ),
      ).pipe(Effect.uninterruptible, Effect.forkChild),
      (transaction) =>
        Deferred.succeed(release, undefined).pipe(Effect.andThen(Fiber.join(transaction))),
    );

    yield* Effect.raceFirst(Deferred.await(started), Fiber.join(transaction));
    const shutdown = yield* Effect.forkChild(runtime.disposeEffect, { startImmediately: true });
    yield* Deferred.succeed(release, undefined);
    yield* Fiber.join(transaction);
    yield* Fiber.join(shutdown);

    assert.deepStrictEqual(
      yield* sql`SELECT identifier FROM verification WHERE identifier = 'drain-pool'`,
      [{ identifier: "drain-pool" }],
    );
    assert.deepStrictEqual(
      yield* sql`SELECT pid FROM pg_stat_activity
      WHERE datname = current_database() AND application_name = 'moku-auth-test'`,
      [],
    );
  }).pipe(
    Effect.scoped,
    Effect.provide(
      Layer.unwrap(
        Config.redacted("TEST_DATABASE_URL").pipe(Effect.map((url) => PgClient.layer({ url }))),
      ),
    ),
  ),
);
