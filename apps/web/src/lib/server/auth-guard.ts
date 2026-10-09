import { error, redirect } from "@sveltejs/kit";
import { Access } from "@moku/core/access";
import { Membership, type OrganizationId } from "@moku/domain/organization";
import { Effect, Match, Schema } from "effect";
import { AuthProvider } from "./auth-provider.ts";
import { Organizations } from "./organizations.ts";

export class Required extends Schema.TaggedError<Required>()("AuthGuard.Required", {}) {}

export const make = Effect.fn("AuthGuard.make")(function* (headers: Headers) {
  const authenticate = yield* Effect.cached(
    AuthProvider.Service.use((auth) => auth.authenticate(headers)),
  );
  /** The signed-in principal with a verified email; anyone else fails. */
  const principal = Effect.gen(function* () {
    const found = yield* authenticate;
    if (found === null) return yield* new Required({});

    return yield* Access.requireVerifiedEmail(found);
  }).pipe(Effect.withSpan("AuthGuard.principal"));
  const membership = Effect.fn("AuthGuard.membership")(function* (organizationId: OrganizationId) {
    const { userId } = yield* principal;
    const organizations = yield* Organizations.Service;
    const role = yield* organizations.role(headers, organizationId);

    return Membership.make({ userId, organizationId, role });
  });

  return { authenticate, principal, membership };
});

export type RequestAuth = Effect.Success<ReturnType<typeof make>>;

/** Translate to Kit control flow only after the request runner. */
export const reject = (
  failure: Required | AuthProvider.Unavailable | Access.UnverifiedEmail,
): never =>
  Match.valueTags(failure, {
    "AuthGuard.Required": () => redirect(303, "/login"),
    "Access.UnverifiedEmail": () => error(403, "Verify your email to continue."),
    "AuthProvider.Unavailable": () => error(503, "We couldn’t verify your session. Try again."),
  });

/** `reject` for commands, where Kit allows no redirect; the client's refresh reaches login. */
export const rejectCommand = (
  failure: Required | AuthProvider.Unavailable | Access.UnverifiedEmail,
): never =>
  failure._tag === "AuthGuard.Required"
    ? error(401, "Your session ended. Sign in again.")
    : reject(failure);

export * as AuthGuard from "./auth-guard.ts";
