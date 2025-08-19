import { SdkException } from "@aha.chat/sdk"
import { DEFAULT_API_VERSION } from "whatsapp-api-js/types"
import { getWhatsappClient } from "./client"
import type { WhatsappAuthValue } from "./index"

/**
 * Get list of ice breakers.
 *
 * @param auth WhatsappAuthValue
 * @returns string phoneNumberId
 */
export const getIceBreakers = async (
  auth: WhatsappAuthValue,
): Promise<string[]> => {
  const client = getWhatsappClient(auth)

  const res = await client.$$apiFetch$$(
    `https://graph.facebook.com/${DEFAULT_API_VERSION}/${auth.metadata.phoneNumber?.id}?fields=conversational_automation`,
  )
  if (!res.ok) {
    throw new SdkException("Access token is not valid")
  }

  const { conversational_automation } = await res.json()

  return conversational_automation?.prompts || []
}

/**
 * Get list of ice breakers.
 *
 * @param auth WhatsappAuthValue
 * @returns string phoneNumberId
 */
export const updateIceBreaker = async (
  auth: WhatsappAuthValue,
  prompts: string[],
): Promise<void> => {
  const client = getWhatsappClient(auth)

  const res = await client.$$apiFetch$$(
    `https://graph.facebook.com/${DEFAULT_API_VERSION}/${auth.metadata.phoneNumber?.id}/conversational_automation`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        enable_welcome_message: true,
        prompts,
      }),
    },
  )
  if (!res.ok) {
    throw new SdkException("Access token is not valid")
  }
}
