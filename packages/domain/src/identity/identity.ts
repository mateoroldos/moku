import { Schema } from "effect";

export const UserId = Schema.NonEmptyString.pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;

/** Authenticated identity; verification and permissions are checked separately. */
export const Principal = Schema.Struct({
  userId: UserId,
  emailVerified: Schema.Boolean,
});
export interface Principal extends Schema.Schema.Type<typeof Principal> {}
