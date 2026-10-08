/** Login and signup return only to an invitation ID, never to a caller-chosen path. */
export const invitationReturn = (
  searchParams: Pick<URLSearchParams, "get">,
): string | undefined => {
  const id = searchParams.get("invitation");

  return id ? `/invitations/${encodeURIComponent(id)}` : undefined;
};

export const withInvitation = (path: string, id: string | null) =>
  id ? `${path}?invitation=${encodeURIComponent(id)}` : path;
