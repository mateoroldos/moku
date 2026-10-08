import { error, redirect } from "@sveltejs/kit";
import { Access } from "@moku/core/access";
import { Membership, type OrganizationId } from "@moku/domain/organization";
import { Effect, Match, Schema } from "effect";
import { AuthProvider } from "./auth-provider.ts";
import { Organizations } from "./organizations.ts";

export class Required extends Schema.TaggedError<Required>()("AuthGuard.Required", {}) {}

export const make = Effect.fn("AuthGuard.make")(function* (requestHeaders: Headers) {
  const headers = new Headers(requestHeaders);
  const authenticate = yield* Effect.cached(
    AuthProvider.Service.use((auth) => auth.authenticate(headers)),
  );
  const requireVerifiedPrincipal = Effect.gen(function* () {
    const principal = yield* authenticate;
    if (principal === null) return yield* new Required({});

    return yield* Access.requireVerifiedEmail(principal);
  });
  const requireMembership = Effect.fn("AuthGuard.requireMembership")(function* (
    organizationId: OrganizationId,
  ) {
    const principal = yield* requireVerifiedPrincipal;
    const organizations = yield* Organizations.Service;
    const role = yield* organizations.role(headers, organizationId);

    return Membership.make({ userId: principal.userId, organizationId, role });
  });

  return { authenticate, requireVerifiedPrincipal, requireMembership };
});

export type Request = Effect.Success<ReturnType<typeof make>>;

/** Translate to Kit control flow only after the request runner. */
export const reject = (
  failure: Required | AuthProvider.Unavailable | Access.UnverifiedEmail,
): never =>
  Match.valueTags(failure, {
    "AuthGuard.Required": () => redirect(303, "/login"),
    "Access.UnverifiedEmail": () => error(403, "Verify your email to continue."),
    "AuthProvider.Unavailable": () => error(503, "We couldn’t verify your session. Try again."),
  });

export * as AuthGuard from "./auth-guard.ts";
