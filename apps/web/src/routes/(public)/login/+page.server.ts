import { error, redirect } from "@sveltejs/kit";
import { Result } from "effect";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
  setHeaders({ "cache-control": "no-store" });

  const result = await locals.run("Load.login", locals.authenticate);
  const principal = Result.getOrElse(result, () =>
    error(503, "We couldn’t check your session. Try again."),
  );

  if (principal?.emailVerified) redirect(303, "/");
};
