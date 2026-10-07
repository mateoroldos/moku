import { error, redirect } from "@sveltejs/kit";
import type { Access } from "@moku/core/access";
import { Effect, Match, Schema } from "effect";
import type { AuthProvider } from "./auth-provider.ts";

export class Required extends Schema.TaggedError<Required>()("AuthGuard.Required", {}) {}

export const requirePrincipal = Effect.fn("AuthGuard.requirePrincipal")(function* <R>(
  authenticate: AuthProvider.IdentityLookup<R>,
) {
  const principal = yield* authenticate;
  if (principal === null) return yield* new Required({});

  return principal;
});

export type Failure = Effect.Error<ReturnType<typeof requirePrincipal>>;

/** Translate to Kit control flow only after the request runner. */
export const reject = (failure: Failure | Access.UnverifiedEmail): never =>
  Match.valueTags(failure, {
    "AuthGuard.Required": () => redirect(303, "/login"),
    "Access.UnverifiedEmail": () => error(403, "Verify your email to continue."),
    "AuthProvider.Unavailable": () => error(503, "We couldn’t verify your session. Try again."),
  });

export * as AuthGuard from "./auth-guard.ts";
