import { assert, it } from "vitest";
import { Option } from "effect";
import { FeedbackDrafts } from "./feedback-drafts.ts";

const key = { userId: "alice", organizationId: "org", taskId: "task" };
const draft = { feedback: "Check the exposure before approving." };

const storage = () => {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
};

it.each([
  { ...key, userId: "bob" },
  { ...key, organizationId: "other" },
  { ...key, taskId: "other" },
  { userId: "alice:org", organizationId: "task", taskId: "tail" },
])("isolates stored feedback from $userId/$organizationId/$taskId", (other) => {
  const entries = storage();
  const drafts = FeedbackDrafts.make(() => entries);
  drafts.write(key, draft);
  drafts.write({ ...key, taskId: "task:tail" }, draft);

  assert.deepEqual(drafts.read(other), Option.none());
  drafts.remove(other);

  assert.deepEqual(drafts.read(key), Option.some(draft));
});

it("clears only the signed-out user's namespace, including adjacent entries", () => {
  const entries = storage();
  const drafts = FeedbackDrafts.make(() => entries);
  drafts.write(key, draft);
  drafts.write({ ...key, taskId: "second" }, draft);
  drafts.write({ ...key, userId: "alice:other" }, draft);
  entries.setItem("unrelated", "keep");

  drafts.clearUser("alice");

  assert.deepEqual(drafts.read(key), Option.none());
  assert.deepEqual(drafts.read({ ...key, taskId: "second" }), Option.none());
  assert.deepEqual(drafts.read({ ...key, userId: "alice:other" }), Option.some(draft));
  assert.equal(entries.getItem("unrelated"), "keep");
});

it.each(["not json", '{"feedback":42}', "{}"])("discards malformed stored feedback: %s", (raw) => {
  const entries = storage();
  entries.setItem("moku:feedback:v1:alice:org:task", raw);
  const drafts = FeedbackDrafts.make(() => entries);

  assert.deepEqual(drafts.read(key), Option.none());
  assert.equal(entries.length, 0);
});

it("returns no draft when browser storage is blocked", () => {
  const drafts = FeedbackDrafts.make(() => {
    throw new DOMException("Blocked", "SecurityError");
  });

  assert.deepEqual(drafts.read(key), Option.none());
});

it.each(["write", "remove", "clearUser"] as const)(
  "keeps %s non-throwing when browser storage is blocked",
  (operation) => {
    const drafts = FeedbackDrafts.make(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    const operations = {
      write: () => drafts.write(key, draft),
      remove: () => drafts.remove(key),
      clearUser: () => drafts.clearUser(key.userId),
    };

    assert.doesNotThrow(operations[operation]);
  },
);

it("preserves the last stored draft when storage quota is exceeded", () => {
  const entries = storage();
  FeedbackDrafts.make(() => entries).write(key, draft);
  const drafts = FeedbackDrafts.make(() => ({
    ...entries,
    setItem: () => {
      throw new DOMException("Full", "QuotaExceededError");
    },
  }));

  drafts.write(key, { feedback: "New input" });

  assert.deepEqual(drafts.read(key), Option.some(draft));
});

it("does not resurrect feedback after the user erases it", () => {
  const entries = storage();
  const drafts = FeedbackDrafts.make(() => entries);
  drafts.write(key, draft);

  drafts.write(key, { feedback: "" });

  assert.deepEqual(drafts.read(key), Option.none());
});
