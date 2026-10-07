import { Context, type Effect, type Redacted, Schema } from "effect";

export interface Message {
  readonly to: string;
  readonly subject: string;
  readonly text: Redacted.Redacted<string>;
}

export class Unavailable extends Schema.TaggedError<Unavailable>()("Email.Unavailable", {
  cause: Schema.Redacted(Schema.Unknown),
}) {}

export interface Interface {
  readonly send: (message: Message) => Effect.Effect<void, Unavailable>;
}

export class Service extends Context.Service<Service, Interface>()("@moku/core/Email") {}

export * as Email from "./email.ts";
