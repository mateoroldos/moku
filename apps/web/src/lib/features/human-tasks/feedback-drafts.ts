import type { TaskRef } from "@moku/domain/human-task";
import type { UserId } from "@moku/domain/identity";
import { Option, Result, Schema } from "effect";

type Key = Schema.Codec.Encoded<typeof TaskRef> & {
  readonly userId: Schema.Codec.Encoded<typeof UserId>;
};

const Draft = Schema.Struct({ feedback: Schema.String });
interface Draft extends Schema.Schema.Type<typeof Draft> {}

const decode = Schema.decodeUnknownResult(Schema.fromJsonString(Draft));
const prefix = (userId: string) => `moku:feedback:v1:${encodeURIComponent(userId)}:`;
const storageKey = ({ userId, organizationId, taskId }: Key) =>
  `${prefix(userId)}${encodeURIComponent(organizationId)}:${encodeURIComponent(taskId)}`;

export const make = (
  getStorage: () => Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">,
) => {
  const access = (operation: () => void): void => {
    try {
      operation();
    } catch {
      // Draft persistence is best-effort; storage failure must not block answering.
    }
  };

  const remove = (key: Key) => access(() => getStorage().removeItem(storageKey(key)));

  const read = (key: Key): Option.Option<Draft> => {
    try {
      const raw = getStorage().getItem(storageKey(key));
      if (raw === null) return Option.none();

      const decoded = decode(raw);
      if (Result.isSuccess(decoded)) return Option.some(decoded.success);

      remove(key);

      return Option.none();
    } catch {
      return Option.none();
    }
  };

  const write = (key: Key, draft: Draft) =>
    access(() => {
      const storage = getStorage();
      if (draft.feedback === "") storage.removeItem(storageKey(key));
      else storage.setItem(storageKey(key), JSON.stringify(draft));
    });

  const clearUser = (userId: Key["userId"]) =>
    access(() => {
      const storage = getStorage();

      for (let index = storage.length - 1; index >= 0; index--) {
        const key = storage.key(index);
        if (key?.startsWith(prefix(userId))) storage.removeItem(key);
      }
    });

  return { read, write, remove, clearUser };
};

export const browser = make(() => window.sessionStorage);

export * as FeedbackDrafts from "./feedback-drafts.ts";
