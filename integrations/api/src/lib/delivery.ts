import { randomUUID } from "node:crypto"
import { assertPublicUrl } from "@chatbotx.io/business"
import ky from "ky"
import { signApiPayload } from "./signature"

const DELIVERY_TIMEOUT_MS = 30_000

export type DeliveryResponse = {
  messageId?: string
}

/**
 * Sign and POST an outbound envelope to the customer's callback URL.
 * `assertPublicUrl` runs at send time (not just save time) because DNS can be
 * re-pointed at a private address after the callback URL was saved.
 */
export const postSignedEnvelope = async (args: {
  callbackUrl: string
  signingSecret: string
  envelope: unknown
}): Promise<DeliveryResponse | null> => {
  await assertPublicUrl(args.callbackUrl, "API channel callback URL")

  const rawBody = JSON.stringify(args.envelope)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = signApiPayload(args.signingSecret, timestamp, rawBody)

  const response = await ky.post(args.callbackUrl, {
    body: rawBody,
    headers: {
      "Content-Type": "application/json",
      "X-ChatbotX-Signature": `sha256=${signature}`,
      "X-ChatbotX-Timestamp": timestamp,
      "X-ChatbotX-Delivery": randomUUID(),
    },
    timeout: DELIVERY_TIMEOUT_MS,
  })

  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as DeliveryResponse
  } catch {
    return null
  }
}
