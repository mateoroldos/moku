import { assert, it } from "@effect/vitest";
import { HumanTasks } from "@moku/core/human-tasks";
import { CryptoDeterministic } from "@moku/core/test/crypto-deterministic";
import { HumanTaskStoreMemory } from "@moku/core/test/human-task-store-memory";
import { ApiKeyId, OrganizationId, OrganizationKey } from "@moku/domain/organization";
import { Effect, Layer, Redacted, type Schema } from "effect";
import { HttpApi } from "./http-api.ts";
import { OrganizationApiKeys } from "./organization-api-keys.ts";

const key = (organization: string) =>
  OrganizationKey.make({
    id: ApiKeyId.make(`${organization}-key`),
    organizationId: OrganizationId.make(organization),
    name: "Trading agent",
  });

const apiKeys = Layer.succeed(OrganizationApiKeys.Service, {
  create: () => Effect.die("unused"),
  list: () => Effect.die("unused"),
  revoke: () => Effect.die("unused"),
  verify: (secret) => {
    switch (Redacted.value(secret)) {
      case "moku_own":
        return Effect.succeed(key("own"));
      case "moku_other":
        return Effect.succeed(key("other"));
      case "moku_limited":
        return Effect.fail(new OrganizationApiKeys.RateLimited({}));
      case "moku_offline":
        return Effect.fail(
          new OrganizationApiKeys.Unavailable({ cause: Redacted.make(new Error("offline")) }),
        );
      default:
        return Effect.fail(new OrganizationApiKeys.InvalidKey({}));
    }
  },
});

const testLayer = HttpApi.layer.pipe(
  Layer.provide(HumanTasks.layer),
  Layer.provide(Layer.merge(HumanTaskStoreMemory.layer, CryptoDeterministic.layer)),
  Layer.provide(apiKeys),
);

const task: Schema.Codec.Encoded<typeof HumanTasks.CreateInput> = {
  intent: "authorize",
  subject: { title: "Buy 10 ACME" },
  response: { type: "approval" },
};

const request = (secret: string | undefined, path: string, body?: typeof task) =>
  HttpApi.Handler.use((handle) =>
    Effect.promise(async () => {
      const headers = new Headers({ "content-type": "application/json" });
      if (secret !== undefined) headers.set("authorization", `Bearer ${secret}`);
      const init: RequestInit =
        body === undefined ? { headers } : { method: "POST", headers, body: JSON.stringify(body) };

      const response = await handle(new Request(`http://localhost/api/v1${path}`, init));
      return { status: response.status, body: await response.json() };
    }),
  );

it.effect("creates a task with a key and returns it, pending, as the key's request", () =>
  Effect.gen(function* () {
    const created = yield* request("moku_own", "/tasks", task);
    const id = "00000000-0000-4000-8000-000000000001";
    assert.deepStrictEqual(created, { status: 201, body: { id } });

    const read = yield* request("moku_own", `/tasks/${id}`);
    assert.strictEqual(read.status, 200);
    assert.deepInclude(read.body, {
      ...task,
      id,
      organizationId: "own",
      status: "pending",
      requester: { id: "own-key", name: "Trading agent" },
    });
  }).pipe(Effect.provide(testLayer)),
);

it.effect("hides a task from another organization's key", () =>
  Effect.gen(function* () {
    const { body } = yield* request("moku_own", "/tasks", task);

    assert.deepStrictEqual(yield* request("moku_other", `/tasks/${body.id}`), {
      status: 404,
      body: { _tag: "TaskNotFound" },
    });
  }).pipe(Effect.provide(testLayer)),
);

it.effect.each([
  { label: "no key", secret: undefined, status: 401, tag: "Unauthorized" },
  { label: "an unknown key", secret: "moku_revoked", status: 401, tag: "Unauthorized" },
  { label: "a rate-limited key", secret: "moku_limited", status: 429, tag: "RateLimited" },
  {
    label: "key verification down",
    secret: "moku_offline",
    status: 503,
    tag: "ServiceUnavailable",
  },
])("answers $label with $status before creating anything", ({ secret, status, tag }) =>
  Effect.gen(function* () {
    const rejected = yield* request(secret, "/tasks", task);
    assert.strictEqual(rejected.status, status);
    assert.strictEqual(rejected.body._tag, tag);

    const { body } = yield* request("moku_own", "/tasks", task);
    assert.strictEqual(body.id, "00000000-0000-4000-8000-000000000001");
  }).pipe(Effect.provide(testLayer)),
);
