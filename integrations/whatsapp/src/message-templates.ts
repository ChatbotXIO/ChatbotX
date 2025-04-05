import { DEFAULT_API_VERSION } from "whatsapp-api-js/types"
import { getWhatsappClient } from "./client.js"
import type { WhatsappAuthValue } from "./index.js"
import { SdkException } from "@ahachat.ai/sdk"

/**
 * Get list of message templates.
 *
 * @param auth WhatsappAuthValue
 * @returns string phoneNumberId
 */
export const getTemplates = async (
  auth: WhatsappAuthValue,
  params: { limit: number },
): Promise<string> => {
  const client = getWhatsappClient(auth)

  const res = await client.$$apiFetch$$(
    `https://graph.facebook.com/${DEFAULT_API_VERSION}/${auth.metadata.wabaId}/message_templates?limit=${params.limit}`,
  )
  if (!res.ok) {
    throw new SdkException("Access token is not valid")
  }

  const { data } = await res.json()

  return data
}

/**
 * Create message templates.
 *
 * @param auth WhatsappAuthValue
 * @returns string phoneNumberId
 */
export const createTemplate = async (
  auth: WhatsappAuthValue,
  body,
): Promise<string> => {
  const client = getWhatsappClient(auth)

  const res = await client.$$apiFetch$$(
    `https://graph.facebook.com/${DEFAULT_API_VERSION}/${auth.metadata.wabaId}/message_templates`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) {
    throw new SdkException("Access token is not valid")
  }

  return await res.json()
}
