import type { HandleRequestProps } from "@chatbotx.io/sdk"
import { TiktokWebhookException } from "../exception"
import { logger } from "../lib/logger"
import { hmacSha256Hex, timingSafeStringEqual } from "../lib/webhook"
import type { TiktokConfig } from "../schema"
import { tiktokWebhookEventSchema } from "../schema"

// TikTok recommends rejecting events older than 5 seconds
const WEBHOOK_TIMESTAMP_WINDOW_SECONDS = 5
// Allow 2s of clock skew between TikTok servers and ours
const WEBHOOK_CLOCK_SKEW_SECONDS = 2

async function verifySignature(
  clientSecret: string,
  signature: string,
  body: string,
): Promise<boolean> {
  const parts = signature.split(",")
  const tPart = parts.find((p) => p.startsWith("t="))
  const sPart = parts.find((p) => p.startsWith("s="))

  if (!(tPart && sPart)) {
    return false
  }

  const timestamp = Number(tPart.slice(2))
  if (!Number.isFinite(timestamp)) {
    return false
  }

  const diffSeconds = Math.floor(Date.now() / 1000) - timestamp
  if (
    diffSeconds < -WEBHOOK_CLOCK_SKEW_SECONDS ||
    diffSeconds > WEBHOOK_TIMESTAMP_WINDOW_SECONDS
  ) {
    return false
  }

  const receivedSig = sPart.slice(2)
  const payload = `${timestamp}.${body}`
  const expected = await hmacSha256Hex(clientSecret, payload)

  return timingSafeStringEqual(expected, receivedSig)
}

export const webhookHandler = async (
  props: HandleRequestProps<TiktokConfig>,
): Promise<string> => {
  const { req, config, queue } = props

  const body = await req.text()
  if (!body) {
    throw new TiktokWebhookException("Empty webhook payload")
  }

  if (!config.clientSecret) {
    throw new TiktokWebhookException(
      "Missing client secret for webhook verification",
    )
  }

  const signature = req.headers.get("TikTok-Signature") ?? ""
  if (
    !(
      signature && (await verifySignature(config.clientSecret, signature, body))
    )
  ) {
    throw new TiktokWebhookException("Invalid or missing webhook signature")
  }

  const parsed = JSON.parse(body) as unknown
  const event = tiktokWebhookEventSchema.safeParse(parsed)

  if (!event.success) {
    logger.warn(
      { errors: event.error.issues },
      "Invalid TikTok webhook payload",
    )
    return "ok"
  }

  const integrationIdentifier = config.openId ?? event.data.user_openid

  if (event.data.event === "authorization.removed") {
    logger.warn(
      { integrationIdentifier },
      "TikTok authorization removed — inbox should be marked disconnected",
    )
    return "ok"
  }

  // im_receive_msg: customer sent a message to the business
  // im_send_msg: echo of a message sent by the business via API (outgoing)
  if (
    event.data.event !== "im_receive_msg" &&
    event.data.event !== "im_send_msg"
  ) {
    return "ok"
  }

  await queue?.add("incomingMessage", {
    type: "incomingMessage",
    data: {
      integrationType: "tiktok",
      integrationIdentifier,
      payload: event.data,
    },
    // Add delay for echo events to avoid race condition where echo arrives
    // before the send message API response completes
    opts: event.data.event === "im_send_msg" ? { delay: 2000 } : undefined,
  })

  return "ok"
}
