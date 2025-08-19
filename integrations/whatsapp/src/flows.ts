import { SdkException } from "@aha.chat/sdk"
import { DEFAULT_API_VERSION } from "whatsapp-api-js/types"
import { getWhatsappClient } from "./client"
import type { WhatsappAuthValue } from "./index"
import type { ListFlowsResponse } from "./types"

/**
 * Get list of flows.
 *
 * @param auth WhatsappAuthValue
 * @returns string phoneNumberId
 */
export const getFlows = async (
  auth: WhatsappAuthValue,
  params: { limit: number },
): Promise<ListFlowsResponse> => {
  const client = getWhatsappClient(auth)

  const res = await client.$$apiFetch$$(
    `https://graph.facebook.com/${DEFAULT_API_VERSION}/${auth.metadata.wabaId}/flows?limit=${params.limit}`,
  )
  if (!res.ok) {
    throw new SdkException(`Unable to list flows: ${await res.text()}`)
  }

  return await res.json()
}
