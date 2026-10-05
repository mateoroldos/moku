import { Context, Effect, Schema } from "effect";

export class Unavailable extends Schema.TaggedError<Unavailable>()("Transaction.Unavailable", {
  cause: Schema.Defect(),
}) {}

export interface Interface {
  readonly run: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | Unavailable, R>;
}

export class Service extends Context.Service<Service, Interface>()("@moku/core/Transaction") {}

export * as Transaction from "./transaction.ts";
