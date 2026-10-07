import { it } from "@effect/vitest";
import { Effect } from "effect";
import { expectTypeOf } from "vitest";
import { OrganizationAccess } from "../organization/organization-access.ts";
import { OrganizationMembershipStore } from "../organization/organization-membership-store.ts";
import { Transaction } from "./transaction.ts";

it("requires a transaction for locked authorization and preserves other requirements", () => {
  expectTypeOf<
    Effect.Services<ReturnType<OrganizationAccess.Interface["requireForWrite"]>>
  >().toEqualTypeOf<Transaction.Active>();
  expectTypeOf<
    Effect.Services<ReturnType<OrganizationMembershipStore.Interface["findForWrite"]>>
  >().toEqualTypeOf<Transaction.Active>();

  const transaction: Transaction.Interface = {
    run: (effect) => effect.pipe(Effect.provideService(Transaction.Active, {})),
  };
  const locked = OrganizationAccess.Service.use((access) => Effect.as(Transaction.Active, access));
  const withinTransaction = transaction.run(locked);

  expectTypeOf<Effect.Services<typeof locked>>().toEqualTypeOf<
    OrganizationAccess.Service | Transaction.Active
  >();
  expectTypeOf<
    Effect.Services<typeof withinTransaction>
  >().toEqualTypeOf<OrganizationAccess.Service>();
});
