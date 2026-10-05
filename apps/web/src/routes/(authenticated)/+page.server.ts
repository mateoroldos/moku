import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = (event) =>
  event.parent().then(({ organizations }) => {
    const only = organizations.length === 1 ? organizations[0] : undefined;

    if (only) redirect(303, `/org/${encodeURIComponent(only.id)}`);
  });
