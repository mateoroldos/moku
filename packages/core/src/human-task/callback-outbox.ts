import type { CallbackUrl, CompletedHumanTask } from "@moku/domain/human-task";
import { Context, Data, type DateTime, type Effect } from "effect";
import type { HumanTaskStore } from "./human-task-store.ts";

/** A completed task waiting to reach its requester's callback URL. */
export interface Delivery {
  readonly task: CompletedHumanTask;
  readonly url: CallbackUrl;
  /** Failed attempts so far. */
  readonly attempts: number;
}

export type Outcome = Data.TaggedEnum<{
  Delivered: {};
  Retry: { readonly at: DateTime.Utc };
  Abandoned: {};
}>;
export const Outcome = Data.taggedEnum<Outcome>();

/** Deliveries that `HumanTaskStore.complete` queues for tasks created with a callback URL. */
export interface Interface {
  /** Sends each delivery due by `now` through `send` while holding it, so concurrent
   * callers never send the same delivery, then records the outcome. A delivery whose
   * send fails or is interrupted stays due. */
  readonly deliverDue: <R>(
    now: DateTime.Utc,
    send: (delivery: Delivery) => Effect.Effect<Outcome, never, R>,
  ) => Effect.Effect<void, HumanTaskStore.PersistenceError, R>;
}

export class Service extends Context.Service<Service, Interface>()("@moku/core/CallbackOutbox") {}

export * as CallbackOutbox from "./callback-outbox.ts";
