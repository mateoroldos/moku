import type { UserId } from "@moku/domain/identity";
import type { Organization } from "@moku/domain/organization";
import { Context, type Effect, Schema } from "effect";

export const Input = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty({ message: "Enter an organization name." })),
});
export interface Input extends Schema.Schema.Type<typeof Input> {}

export class Unavailable extends Schema.TaggedError<Unavailable>()(
  "OrganizationCreation.Unavailable",
  {
    cause: Schema.Redacted(Schema.Unknown),
  },
) {}

export interface Interface {
  /** Atomically create the organization and its owner membership. */
  readonly createWithOwner: (
    ownerUserId: UserId,
    input: Input,
  ) => Effect.Effect<Organization, Unavailable>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@moku/core/OrganizationCreation",
) {}

export * as OrganizationCreation from "./organization-creation.ts";
