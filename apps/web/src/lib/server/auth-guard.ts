import { error, redirect } from "@sveltejs/kit";
import { Access } from "@moku/core/access";
import { Membership, type OrganizationId } from "@moku/domain/organization";
import { Effect, Match, Schema } from "effect";
import type { AuthProvider } from "./auth-provider.ts";
import { Organizations } from "./organizations.ts";

export class Required extends Schema.TaggedError<Required>()("AuthGuard.Required", {}) {}

export const requirePrincipal = Effect.fn("AuthGuard.requirePrincipal")(function* <R>(
  authenticate: AuthProvider.IdentityLookup<R>,
) {
  const principal = yield* authenticate;
  if (principal === null) return yield* new Required({});

  return principal;
});

export type Failure = Effect.Error<ReturnType<typeof requirePrincipal>>;

export const requireVerifiedPrincipal = Effect.fn("AuthGuard.requireVerifiedPrincipal")(function* <
  R,
>(authenticate: AuthProvider.IdentityLookup<R>) {
  const principal = yield* requirePrincipal(authenticate);

  return yield* Access.requireVerifiedEmail(principal);
});

/** Resolve the verified caller's membership; core operations take it as their scope. */
export const requireMembership = Effect.fn("AuthGuard.requireMembership")(function* <R>(
  authenticate: AuthProvider.IdentityLookup<R>,
  headers: Headers,
  organizationId: OrganizationId,
) {
  const principal = yield* requireVerifiedPrincipal(authenticate);
  const organizations = yield* Organizations.Service;
  const role = yield* organizations.role(headers, organizationId);

  return Membership.make({ userId: principal.userId, organizationId, role });
});

/** Translate to Kit control flow only after the request runner. */
export const reject = (failure: Failure | Access.UnverifiedEmail): never =>
  Match.valueTags(failure, {
    "AuthGuard.Required": () => redirect(303, "/login"),
    "Access.UnverifiedEmail": () => error(403, "Verify your email to continue."),
    "AuthProvider.Unavailable": () => error(503, "We couldn’t verify your session. Try again."),
  });

export * as AuthGuard from "./auth-guard.ts";
