import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WhatsappCredential } from "@chatbotx.io/database/partials"
import {
  appAccessToken,
  exchangeAccessToken,
} from "@chatbotx.io/integration-whatsapp/api/auth"
import { resolveOwningWabaId } from "@chatbotx.io/integration-whatsapp/api/waba-owner"
import { WHATSAPP_OAUTH_CALLBACK_PATH } from "./embedded-signup"

/**
 * Turns an Embedded Signup `code` into a token that is proven to belong to the
 * WhatsApp Business Account an existing integration already owns.
 *
 * The grant can name several targets; the integration's own phone number hints
 * the resolver so a coexistence node listed first cannot make a valid
 * re-authorization look like a mismatch. A token for any other account is
 * refused, so an admin can never attach a foreign account to this integration.
 * Shared by the channel reconnect and the dedicated Conversions API connect —
 * each passes its own translated messages.
 */
export async function exchangeCodeForOwnedWabaToken(input: {
  code: string
  existing: { wabaId: string; phoneNumberId: string }
  whatsappSettings: WhatsappCredential
  /** Origin the OAuth callback is registered on for this credential. */
  originUrl: string
  messages: { wabaResolveFailed: string; wabaMismatch: string }
}): Promise<{ accessToken: string; appAccessToken: string; wabaId: string }> {
  const accessToken = (
    await exchangeAccessToken(
      input.whatsappSettings,
      input.code,
      new URL(WHATSAPP_OAUTH_CALLBACK_PATH, input.originUrl).toString(),
    )
  ).access_token
  const appToken = appAccessToken(input.whatsappSettings)
  const wabaId = await resolveOwningWabaId({
    accessToken,
    appAccessToken: appToken,
    version: input.whatsappSettings.version,
    systemUserToken: input.whatsappSettings.systemUserToken,
    systemUserId: input.whatsappSettings.systemUserId,
    phoneNumberIds: [input.existing.phoneNumberId],
  })
  if (!wabaId) {
    throw new ChatbotXException(input.messages.wabaResolveFailed)
  }
  if (wabaId !== input.existing.wabaId) {
    throw new ChatbotXException(input.messages.wabaMismatch)
  }

  return { accessToken, appAccessToken: appToken, wabaId }
}
