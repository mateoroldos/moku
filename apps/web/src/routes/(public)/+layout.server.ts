import { Result } from "effect";
import { AuthProvider } from "#lib/server/auth-provider.ts";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
  const result = await locals.run(
    "Load.signup",
    AuthProvider.Service.useSync(({ signup }) => signup),
  );

  return { signup: Result.getOrThrow(result) };
};
