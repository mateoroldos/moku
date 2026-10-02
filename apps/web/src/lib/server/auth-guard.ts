import { error, redirect } from "@sveltejs/kit";
import { Effect, Match, Schema } from "effect";
import { Authentication } from "./authentication.ts";

export class Required extends Schema.TaggedError<Required>()("AuthGuard.Required", {}) {}
export class Unverified extends Schema.TaggedError<Unverified>()("AuthGuard.Unverified", {}) {}

const VerifiedPrincipal = Schema.Struct({ userId: Schema.NonEmptyString }).pipe(
  Schema.brand("VerifiedPrincipal"),
);

export const requireVerified = Effect.gen(function* () {
  const authentication = yield* Authentication.Service;
  const session = yield* authentication.authenticate;
  if (session === null) return yield* new Required({});
  if (!session.user.emailVerified) return yield* new Unverified({});
  return VerifiedPrincipal.make({ userId: session.user.id });
});

/** Kit control flow belongs after the request runner, outside the Effect workflow. */
export const reject = (failure: Required | Unverified | Authentication.Unavailable): never =>
  Match.valueTags(failure, {
    "AuthGuard.Required": () => redirect(303, "/login"),
    "AuthGuard.Unverified": () => error(403, "Verify your email before reviewing tasks."),
    "Authentication.Unavailable": () => error(503, "We couldn’t verify your session. Try again."),
  });

export * as AuthGuard from "./auth-guard.ts";
