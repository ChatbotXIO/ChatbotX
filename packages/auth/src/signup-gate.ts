import { invitationService } from "@chatbotx.io/business"
import type { BetterAuthOptions } from "better-auth"
import { isSignUpDisabled } from "./keys"

type UserCreateBeforeHook = NonNullable<
  NonNullable<
    NonNullable<
      NonNullable<BetterAuthOptions["databaseHooks"]>["user"]
    >["create"]
  >["before"]
>

export type SignUpGateContext = NonNullable<Parameters<UserCreateBeforeHook>[1]>

/** httpOnly, 10 min, path `/`, sameSite lax, secure in production. */
export const INVITATION_COOKIE_NAME = "chatbotx_invitation"
export const INVITATION_COOKIE_MAX_AGE_SECONDS = 10 * 60

/** The OAuth callback error code for a signup rejected by the lockdown. */
export const SIGNUP_DISABLED_CODE = "signup_disabled"

/** `true` when sign-up may proceed: lockdown off, or a live invitation cookie. */
export const isSignUpAllowed = async (
  context: SignUpGateContext | null,
): Promise<boolean> => {
  if (!isSignUpDisabled()) {
    return true
  }

  const code = context?.getCookie(INVITATION_COOKIE_NAME)
  if (!code) {
    return false
  }

  return Boolean(await invitationService.findActiveByCode(code))
}
