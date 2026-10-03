import { assert } from "@effect/vitest";
import { HumanTaskId, HumanTaskTitle, PendingHumanTask } from "@moku/domain/human-task";
import { UserId } from "@moku/domain/identity";
import { OrganizationId } from "@moku/domain/organization";
import { DateTime, Effect } from "effect";
import { HumanTaskStore } from "../human-task/human-task-store.ts";

export const organizationId = OrganizationId.make("test-org");
export const otherOrganizationId = OrganizationId.make("other-org");
export const attribution = { userId: UserId.make("test-user"), role: "member" } as const;
export const ref = (taskId: HumanTaskId) => ({ organizationId, taskId });

/** Run against isolated stores with test-org and other-org present. */
export const lifecycle = Effect.gen(function* () {
  const store = yield* HumanTaskStore.Service;
  const task = PendingHumanTask.make({
    id: HumanTaskId.make("00000000-0000-4000-8000-000000000001"),
    organizationId,
    intent: "authorize",
    subject: { title: HumanTaskTitle.make("Publish report"), description: "Line one\nLine two" },
    context: "",
    response: { type: "approval" },
    createdAt: DateTime.makeUnsafe("2026-09-28T12:34:56.789Z"),
    status: "pending",
  });
  assert.deepStrictEqual(yield* store.list(organizationId), []);
  assert.deepStrictEqual(yield* store.create(task), task);
  assert.deepStrictEqual(yield* store.get(ref(task.id)), task);
  const replacement = PendingHumanTask.make({
    ...task,
    subject: { title: HumanTaskTitle.make("Different proposal") },
    context: "Must not replace the original",
  });
  assert.instanceOf(yield* Effect.flip(store.create(replacement)), HumanTaskStore.PersistenceError);
  const result = { decision: "approved", feedback: "" } as const;
  const completedAt = DateTime.makeUnsafe("2026-09-28T13:00:00.123Z");
  const completed = yield* store.complete(ref(task.id), result, completedAt, attribution);
  assert.deepStrictEqual(completed, {
    ...task,
    status: "completed",
    result,
    completedAt,
    attribution,
  });
  assert.deepStrictEqual(yield* store.list(organizationId), [completed]);
  for (const retry of [result, { decision: "rejected" }] as const) {
    assert.deepStrictEqual(
      yield* Effect.flip(
        store.complete(ref(task.id), retry, completedAt, { ...attribution, role: "admin" }),
      ),
      new HumanTaskStore.AlreadyCompleted(ref(task.id)),
    );
  }
  assert.instanceOf(yield* Effect.flip(store.create(task)), HumanTaskStore.PersistenceError);
  assert.deepStrictEqual(yield* store.get(ref(task.id)), completed);
});

export const isolation = Effect.gen(function* () {
  const store = yield* HumanTaskStore.Service;
  const first = PendingHumanTask.make({
    id: HumanTaskId.make("00000000-0000-4000-8000-000000000001"),
    organizationId,
    intent: "authorize",
    subject: { title: HumanTaskTitle.make("First proposal") },
    response: { type: "approval" },
    createdAt: DateTime.makeUnsafe(0),
    status: "pending",
  });
  const sibling = PendingHumanTask.make({
    ...first,
    id: HumanTaskId.make("00000000-0000-4000-8000-000000000002"),
    organizationId: otherOrganizationId,
  });
  const missing = ref(HumanTaskId.make("00000000-0000-4000-8000-000000000003"));
  yield* store.create(first);
  yield* store.create(sibling);
  assert.deepStrictEqual(yield* store.get(ref(first.id)), first);
  for (const inaccessible of [missing, ref(sibling.id)]) {
    assert.deepStrictEqual(
      yield* Effect.flip(store.get(inaccessible)),
      new HumanTaskStore.NotFound(inaccessible),
    );
    assert.deepStrictEqual(
      yield* Effect.flip(
        store.complete(inaccessible, { decision: "approved" }, first.createdAt, attribution),
      ),
      new HumanTaskStore.NotFound(inaccessible),
    );
  }
  assert.deepStrictEqual(yield* store.list(organizationId), [first]);
  assert.deepStrictEqual(yield* store.list(otherOrganizationId), [sibling]);
  const completed = yield* store.complete(
    { organizationId: otherOrganizationId, taskId: sibling.id },
    { decision: "rejected" },
    first.createdAt,
    attribution,
  );
  assert.instanceOf(
    yield* Effect.flip(
      store.complete(ref(sibling.id), { decision: "approved" }, first.createdAt, attribution),
    ),
    HumanTaskStore.NotFound,
  );
  assert.deepStrictEqual(yield* store.list(otherOrganizationId), [completed]);
});

export * as HumanTaskStoreContract from "./human-task-store-contract.ts";
