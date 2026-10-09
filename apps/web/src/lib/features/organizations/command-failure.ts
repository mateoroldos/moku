import { refreshAll } from "$app/navigation";
import { isHttpError } from "@sveltejs/kit";

/** Why a Team command didn't complete. A refusal means the page is stale; retrying any Team command is safe. */
export type CommandFailure = { readonly message: string; readonly refused: boolean };

/**
 * Resolves to a Team command's failure, or nothing once done. A 4xx refreshes the page so
 * its route can sign the caller out or drop controls their role lost. After a refusal the
 * caller refreshes once its message is shown, since refreshing can remove the row showing it.
 */
export const commandFailure = async (
  command: Promise<{ readonly rejected: string } | undefined>,
): Promise<CommandFailure | undefined> => {
  try {
    const outcome = await command;

    return outcome && { message: outcome.rejected, refused: true };
  } catch (error) {
    if (!isHttpError(error)) {
      // oxlint-disable-next-line effecttsgo/global-console -- Locally handled failures do not reach Kit's error hook.
      console.error("Team command request failed");
      return {
        message: "We couldn’t reach Moku. Check your connection and try again.",
        refused: false,
      };
    }
    if (error.status < 500) await refreshAll();

    return { message: error.body.message, refused: false };
  }
};
