import { PgClient } from "@effect/sql-pg";
import { assert, it } from "@effect/vitest";
import { HumanTaskDirectory } from "@moku/core/human-task-directory";
import { UserId } from "@moku/domain/identity";
import { OrganizationId } from "@moku/domain/organization";
import { Config, Effect, Layer, Schema } from "effect";
import { WebRuntime } from "./runtime.ts";

const observer = Layer.unwrap(
  Config.redacted("TEST_DATABASE_URL").pipe(Effect.map((url) => PgClient.layer({ url }))),
);
const principal = { userId: UserId.make("runtime-user"), emailVerified: true };
const organizationId = OrganizationId.make("runtime-org");

it.live("persists across server runtimes and releases their PostgreSQL connections", () =>
  Effect.gen(function* () {
    const url = yield* Config.redacted("TEST_DATABASE_URL");
    const sql = yield* PgClient.PgClient;

    yield* sql`INSERT INTO "user" (id, name, email, email_verified) VALUES ('runtime-user', 'Runtime', 'runtime@example.test', true) ON CONFLICT DO NOTHING`;
    yield* sql`INSERT INTO organization (id, name, slug, created_at) VALUES ('runtime-org', 'Runtime', 'runtime', now()) ON CONFLICT DO NOTHING`;
    yield* sql`INSERT INTO member (id, user_id, organization_id, role, created_at) VALUES ('runtime-member', 'runtime-user', 'runtime-org', 'owner', now()) ON CONFLICT DO NOTHING`;

    const acquire = Effect.acquireRelease(
      Effect.sync(() => WebRuntime.make(url)),
      (runtime) => Effect.promise(() => runtime.dispose()),
    );

    const input = yield* Schema.decodeEffect(HumanTaskDirectory.CreateInput)({
      intent: "authorize",
      subject: { title: "Runtime persistence verification" },
      response: { type: "approval" },
    });

    const pending = yield* Effect.scoped(
      Effect.gen(function* () {
        const runtime = yield* acquire;
        return yield* Effect.promise(() =>
          runtime.runPromise(
            HumanTaskDirectory.Service.use((directory) =>
              directory.create(principal, organizationId, input),
            ),
          ),
        );
      }),
    );

    yield* Effect.gen(function* () {
      const connections = yield* sql`
        SELECT pid FROM pg_stat_activity
        WHERE datname = current_database() AND application_name = 'moku-web'
      `;
      assert.lengthOf(connections, 0);

      const completed = yield* Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* acquire;
          return yield* Effect.promise(() =>
            runtime.runPromise(
              Effect.gen(function* () {
                const directory = yield* HumanTaskDirectory.Service;
                assert.deepStrictEqual(
                  yield* directory.get(principal, { organizationId, taskId: pending.id }),
                  pending,
                );
                return yield* directory.respond(
                  principal,
                  { organizationId, taskId: pending.id },
                  {
                    decision: "approved",
                    feedback: "Reviewed",
                  },
                );
              }),
            ),
          );
        }),
      );

      yield* Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* acquire;
          const saved = yield* Effect.promise(() =>
            runtime.runPromise(
              HumanTaskDirectory.Service.use((directory) =>
                directory.get(principal, { organizationId, taskId: pending.id }),
              ),
            ),
          );
          assert.deepStrictEqual(saved, completed);
        }),
      );

      const remaining = yield* sql`
        SELECT pid FROM pg_stat_activity
        WHERE datname = current_database() AND application_name = 'moku-web'
      `;
      assert.lengthOf(remaining, 0);
    }).pipe(
      Effect.ensuring(sql`DELETE FROM human_tasks WHERE id = ${pending.id}`.pipe(Effect.orDie)),
    );
  }).pipe(Effect.provide(observer)),
);
