import type { Access } from "@moku/core/access";
import { UserId } from "@moku/domain/identity";
import type { OrganizationId } from "@moku/domain/organization";
import { Context, type Effect, type Redacted, Schema } from "effect";

export const CreateInput = Schema.Struct({
  name: Schema.Trim.check(
    Schema.isNonEmpty({ message: "Name the key after the agent that uses it." }),
    // Better Auth's default name limit.
    Schema.isMaxLength(32, { message: "Use at most 32 characters." }),
  ),
});
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

export const ApiKey = Schema.Struct({
  /** Better Auth's key record; revocation addresses it. */
  id: Schema.String,
  name: Schema.String,
  /** The key's first characters, to recognize it without the secret. */
  start: Schema.String,
  createdBy: UserId,
  createdAt: Schema.DateTimeUtc,
  lastUsedAt: Schema.NullOr(Schema.DateTimeUtc),
});
export interface ApiKey extends Schema.Schema.Type<typeof ApiKey> {}

/** The secret exists only here, once, at creation. */
export interface CreatedApiKey {
  readonly apiKey: ApiKey;
  readonly secret: Redacted.Redacted<string>;
}

export class Unavailable extends Schema.TaggedError<Unavailable>()(
  "OrganizationApiKeys.Unavailable",
  { cause: Schema.Redacted(Schema.Unknown) },
) {}

/** Better Auth lists at most 100 keys; a key past them couldn't be found to revoke. */
export class KeyLimit extends Schema.TaggedError<KeyLimit>()("OrganizationApiKeys.KeyLimit", {}) {}

/** Owners and admins manage keys; other members get `Access.Denied`, anyone else `Access.NotFound`. */
export interface Interface {
  /** A key that can create and read the organization's tasks; `createdBy` is the session owner. */
  readonly create: (
    headers: Headers,
    organizationId: OrganizationId,
    createdBy: UserId,
    input: CreateInput,
  ) => Effect.Effect<CreatedApiKey, Access.NotFound | Access.Denied | KeyLimit | Unavailable>;
  /** Every key of the organization, newest first. */
  readonly list: (
    headers: Headers,
    organizationId: OrganizationId,
  ) => Effect.Effect<ReadonlyArray<ApiKey>, Access.NotFound | Access.Denied | Unavailable>;
  /** Deletes the key; requests with it fail from then on. An unknown key is `Access.NotFound`. */
  readonly revoke: (
    headers: Headers,
    keyId: string,
  ) => Effect.Effect<void, Access.NotFound | Access.Denied | Unavailable>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@moku/web/OrganizationApiKeys",
) {}

export * as OrganizationApiKeys from "./organization-api-keys.ts";
