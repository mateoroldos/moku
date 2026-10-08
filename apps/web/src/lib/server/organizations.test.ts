import { assert, it } from "@effect/vitest";
import { Result, Schema } from "effect";
import { Organizations } from "./organizations.ts";

it.each([
  { email: "bob@gmail", accepted: false },
  { email: "bob.@gmail.com", accepted: false },
  { email: "bob@gmail.c", accepted: false },
  { email: "Bob.O'Neil+moku@mail.example.com", accepted: true },
])("accepts only emails Better Auth accepts: $email", ({ email, accepted }) => {
  const result = Schema.decodeResult(Organizations.InviteInput)({ email, role: "member" });

  assert.strictEqual(Result.isSuccess(result), accepted);
});
