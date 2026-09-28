import type { HandleClientError } from "@sveltejs/kit/hooks";

export const handleError: HandleClientError = ({ kind, error }) => {
  if (kind !== "unknown") return;
  // oxlint-disable-next-line effecttsgo/global-console -- Client failures occur outside the server runtime.
  console.error(error);
  return { message: "Something went wrong. Refresh before trying again." };
};
