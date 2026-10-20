import { INVITATION_COOKIE_NAME } from "@chatbotx.io/auth/server"
import { invitationService } from "@chatbotx.io/business"
import { cookies } from "next/headers"

/** The active invitation carried by the short-lived browser cookie. */
export const resolveInvitationFromCookie = async () => {
  const code = (await cookies()).get(INVITATION_COOKIE_NAME)?.value
  return code ? await invitationService.findActiveByCode(code) : null
}
