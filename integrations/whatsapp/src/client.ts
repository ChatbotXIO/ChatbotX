import { SdkException } from "@ahachat.ai/sdk"
import { WhatsAppAPI } from "whatsapp-api-js"
import { DEFAULT_API_VERSION } from "whatsapp-api-js/types"
import type { WhatsappAuthValue } from "./schemas"

export const getWhatsappClient = (auth: WhatsappAuthValue) => {
  return new WhatsAppAPI({
    token: auth.tokens.accessToken,
    appSecret: auth.clientSecret,
    v: DEFAULT_API_VERSION,
  })
}

/**
 * Verify token and get first phoneNumberId
 *
 * @param auth WhatsappAuthValue
 * @returns string phoneNumberId
 */
export const verifyAccessToken = async (
  auth: WhatsappAuthValue,
): Promise<string> => {
  const client = getWhatsappClient(auth)

  const res = await client.$$apiFetch$$(
    `https://graph.facebook.com/${DEFAULT_API_VERSION}/${auth.metadata.wabaId}/phone_numbers`,
  )
  if (!res.ok) {
    throw new SdkException("Access token is not valid")
  }

  const {
    data: [{ id: phoneNumberId }],
  } = await res.json()
  if (!phoneNumberId) {
    throw new SdkException("Phone number is not found")
  }

  return phoneNumberId
}
