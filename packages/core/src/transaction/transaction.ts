import { Context, Effect, Schema } from "effect";

export class Unavailable extends Schema.TaggedError<Unavailable>()("Transaction.Unavailable", {
  cause: Schema.Defect(),
}) {}

export interface Interface {
  readonly run: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | Unavailable, Exclude<R, Active>>;
}

/** Available only within the transaction adapter's run boundary. */
export class Active extends Context.Service<Active, {}>()("@moku/core/Transaction.Active") {}

export class Service extends Context.Service<Service, Interface>()("@moku/core/Transaction") {}

export * as Transaction from "./transaction.ts";
