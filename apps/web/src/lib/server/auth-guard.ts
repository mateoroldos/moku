import { error, redirect } from "@sveltejs/kit";
import { Access } from "@moku/core/access";
import { Effect, Match, Schema } from "effect";
import type { AuthProvider } from "./auth-provider.ts";

export class Required extends Schema.TaggedError<Required>()("AuthGuard.Required", {}) {}

export const requireVerified = Effect.fn("AuthGuard.requireVerified")(function* <R>(
  authenticate: AuthProvider.IdentityLookup<R>,
) {
  const principal = yield* authenticate;
  if (principal === null) return yield* new Required({});
  return yield* Access.requireVerified(principal);
});

export type Failure = Effect.Error<ReturnType<typeof requireVerified>>;

/** Translate to Kit control flow only after the request runner. */
export const reject = (failure: Failure): never =>
  Match.valueTags(failure, {
    "AuthGuard.Required": () => redirect(303, "/login"),
    "Access.Unverified": () => error(403, "Verify your email to continue."),
    "AuthProvider.Unavailable": () => error(503, "We couldn’t verify your session. Try again."),
  });

export * as AuthGuard from "./auth-guard.ts";
