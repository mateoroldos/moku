import { Access } from "@moku/core/access";
import { Invitations } from "@moku/core/invitations";
import { isAPIError } from "better-auth/api";
import { Redacted } from "effect";

const invitationReasons = new Map<string, Invitations.Rejected["reason"]>([
  ["INVALID_EMAIL", "InvalidEmail"],
  ["USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION", "AlreadyInvited"],
  ["USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION", "AlreadyMember"],
  ["INVITATION_NOT_FOUND", "InvalidInvitation"],
  ["ORGANIZATION_NOT_FOUND", "InvalidInvitation"],
  ["YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION", "WrongRecipient"],
  ["INVITATION_LIMIT_REACHED", "LimitReached"],
  ["ORGANIZATION_MEMBERSHIP_LIMIT_REACHED", "LimitReached"],
]);

export const invitationFailure = (cause: unknown) => {
  if (isAPIError(cause)) {
    switch (cause.body?.code) {
      case "MEMBER_NOT_FOUND":
        return new Access.NotFound({});
      case "YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION":
      case "YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE":
        return new Access.Denied({});
      case "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION":
        return new Access.UnverifiedEmail({});
    }

    const reason =
      cause.statusCode === 401 ? "SessionRequired" : invitationReasons.get(cause.body?.code ?? "");
    if (reason) return new Invitations.Rejected({ reason });
  }

  return new Invitations.Unavailable({ cause: Redacted.make(cause) });
};
