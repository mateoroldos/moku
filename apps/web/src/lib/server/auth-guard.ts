import { error, redirect } from "@sveltejs/kit";
import { Effect, Match, Schema } from "effect";
import { Authentication } from "./authentication.ts";

export class Required extends Schema.TaggedError<Required>()("AuthGuard.Required", {}) {}
export class Unverified extends Schema.TaggedError<Unverified>()("AuthGuard.Unverified", {}) {}

export const requireVerified = Effect.fnUntraced(function* (event: Authentication.RequestContext) {
  const user = yield* Authentication.session(event);
  if (user === null) return yield* new Required({});
  if (!user.emailVerified) return yield* new Unverified({});
  return user;
});

export type Failure = Effect.Error<ReturnType<typeof requireVerified>>;

/** Translate to Kit control flow only after the request runner. */
export const reject = (failure: Failure): never =>
  Match.valueTags(failure, {
    "AuthGuard.Required": () => redirect(303, "/login"),
    "AuthGuard.Unverified": () => error(403, "Verify your email to continue."),
    "Authentication.Unavailable": () => error(503, "We couldn’t verify your session. Try again."),
  });

export * as AuthGuard from "./auth-guard.ts";
