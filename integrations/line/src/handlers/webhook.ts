import {
  CHANNEL_AUDIENCE_EVENT_JOB_NAME,
  type ChannelAudienceEventJobData,
  type HandleRequestProps,
} from "@chatbotx.io/sdk"
import {
  hmacSha256Base64,
  timingSafeStringEqual,
} from "@chatbotx.io/utils/crypto"
import { LineException } from "../exception"
import type { LineConfig } from "../schema"
import { type LineWebhookEvent, lineWebhookBodySchema } from "../schema/webhook"

/**
 * LINE signs the RAW request body: `X-Line-Signature` is the base64
 * HMAC-SHA256 with the channel secret. Never re-serialize before verifying.
 */
export const verifyLineSignature = async (
  rawBody: string,
  signature: string | null,
  channelSecret: string,
): Promise<boolean> => {
  if (!(signature && channelSecret)) {
    return false
  }
  const expected = await hmacSha256Base64(channelSecret, rawBody)
  return timingSafeStringEqual(signature, expected)
}

const lineTimestampToIso = (timestamp: number | undefined): string =>
  typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp).toISOString()
    : new Date().toISOString()

/** `follow` / `unfollow` carry the user in `source.userId`, no message. */
export const parseLineFollowEvent = (
  event: LineWebhookEvent,
  channelId: string,
): ChannelAudienceEventJobData | null => {
  const isFollow = event.type === "follow"
  if (!(isFollow || event.type === "unfollow")) {
    return null
  }
  const userId = event.source?.userId
  if (!userId) {
    return null
  }
  return {
    integrationType: "line",
    integrationIdentifier: channelId,
    event: {
      kind: isFollow ? "follow" : "unfollow",
      user: { sourceId: userId },
      occurredAt: lineTimestampToIso(event.timestamp),
    },
  }
}

/**
 * A signed body LINE sent that we cannot read is a client error (400), kept
 * apart from the server-side failures (queue, Redis) the route answers with a
 * 5xx so LINE redelivers them.
 */
const parseWebhookBody = (rawBody: string) => {
  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch (error) {
    throw new LineException(
      "Webhook body is not JSON",
      400,
      "lineError",
      null,
      undefined,
      error,
    )
  }
  const parsed = lineWebhookBodySchema.safeParse(json)
  if (!parsed.success) {
    throw new LineException(
      "Webhook body does not match the LINE schema",
      400,
      "lineError",
      null,
      undefined,
      parsed.error,
    )
  }
  return parsed.data
}

export const webhookHandler = async (
  props: HandleRequestProps<LineConfig>,
): Promise<string> => {
  const { req, config, queue } = props

  const rawBody = await req.text()
  const signatureValid = await verifyLineSignature(
    rawBody,
    req.headers.get("x-line-signature"),
    config.channelSecret,
  )
  if (!signatureValid) {
    throw new LineException("Invalid webhook signature", 401)
  }

  const body = parseWebhookBody(rawBody)
  if (body.destination !== config.botUserId) {
    throw new LineException("Webhook destination does not match this bot", 400)
  }

  for (const event of body.events) {
    // Group/room traffic is out of scope (1:1 only).
    if (event.source?.type !== "user") {
      continue
    }
    if (event.type === "message" || event.type === "postback") {
      await queue?.add("incomingMessage", {
        type: "incomingMessage",
        data: {
          integrationType: "line",
          integrationIdentifier: config.channelId,
          payload: event,
        },
      })
      continue
    }
    const audienceEvent = parseLineFollowEvent(event, config.channelId)
    if (audienceEvent) {
      await queue?.add(CHANNEL_AUDIENCE_EVENT_JOB_NAME, {
        type: CHANNEL_AUDIENCE_EVENT_JOB_NAME,
        data: audienceEvent,
      })
    }
  }

  return "OK"
}
