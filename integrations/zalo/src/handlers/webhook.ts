import {
  CHANNEL_AUDIENCE_EVENT_JOB_NAME,
  type ChannelAudienceEventJobData,
  type ContextQueue,
  type HandleRequestProps,
  SdkException,
} from "@chatbotx.io/sdk"
import { sha256Hex, timingSafeStringEqual } from "../lib/webhook"
import type { ZaloConfig } from "../schema/definition"
import {
  TAG_EVENT_NAMES,
  type ZaloWebhookEvent,
  zaloWebhookEventSchema,
} from "../schema/webhook"

const TAG_EVENT_NAME_SET = new Set<string>(TAG_EVENT_NAMES)

/** Zalo sends `timestamp` as epoch milliseconds in a string. */
const zaloTimestampToIso = (timestamp: string | undefined): string => {
  const millis = Number(timestamp)
  return Number.isFinite(millis) && millis > 0
    ? new Date(millis).toISOString()
    : new Date().toISOString()
}

/**
 * A `follow`/`unfollow` event carries `oa_id` + `follower.id` and no
 * sender/recipient, so it never fits the message path. Returns the audience
 * job payload, or null when the event is not a well-formed (un)follow. A QR
 * scan that makes the user follow arrives as an ordinary `follow` (with a
 * `source` hint), so it scores the same way.
 */
export const parseZaloFollowEvent = (
  webhookData: ZaloWebhookEvent,
): ChannelAudienceEventJobData | null => {
  const isFollow = webhookData.event_name === "follow"
  if (!(isFollow || webhookData.event_name === "unfollow")) {
    return null
  }
  const followerId = webhookData.follower?.id
  if (!(webhookData.oa_id && followerId)) {
    return null
  }
  return {
    integrationType: "zalo",
    integrationIdentifier: webhookData.oa_id,
    event: {
      kind: isFollow ? "follow" : "unfollow",
      user: { sourceId: followerId },
      occurredAt: zaloTimestampToIso(webhookData.timestamp),
      ...(webhookData.source ? { source: webhookData.source } : {}),
    },
  }
}

const _verifyWebhookSignature = async (
  payload: ZaloWebhookEvent,
  signature: string,
  config: ZaloConfig,
): Promise<boolean> => {
  try {
    const elements = signature.split("=")
    if (elements.length !== 2) {
      return false
    }

    const signatureHash = elements[1]

    const appId = payload.app_id
    const timeStamp = payload.timestamp
    const dataString = JSON.stringify(payload)
    const content = appId + dataString + timeStamp + config.verifyToken
    const expectedHash = await sha256Hex(content)

    return timingSafeStringEqual(signatureHash, expectedHash)
  } catch {
    return false
  }
}

/**
 * Zalo signs `X-ZEvent-Signature: mac=sha256(appId + rawBody + timestamp +
 * secret)`. Verified against the RAW body (re-serializing the parsed JSON
 * changes key order/spacing and never matches — likely why the legacy
 * all-events check above stays disabled). Only enforced for (un)follow,
 * which award leaderboard points: an unsigned/forged follow is dropped.
 */
const verifyRawWebhookSignature = async (
  rawBody: string,
  payload: ZaloWebhookEvent,
  signature: string,
  config: ZaloConfig,
): Promise<boolean> => {
  const [, signatureHash] = signature.split("=")
  if (!(signatureHash && config.verifyToken)) {
    return false
  }
  const expectedHash = await sha256Hex(
    `${payload.app_id}${rawBody}${payload.timestamp}${config.verifyToken}`,
  )
  return timingSafeStringEqual(signatureHash, expectedHash)
}

const handleWebhookEvent = async (
  req: Request,
  config: ZaloConfig,
  queue: ContextQueue,
): Promise<void> => {
  try {
    const rawBody = await req.text()
    const body = rawBody ? JSON.parse(rawBody) : null
    if (!body) {
      throw new SdkException("Empty webhook payload")
    }

    const webhookData = zaloWebhookEventSchema.parse(body)

    // Tag events carry oa_id + tag (no sender/recipient). Route them before
    // the message-event handling below.
    if (TAG_EVENT_NAME_SET.has(webhookData.event_name) && webhookData.oa_id) {
      await queue.add("channelLabelChange", {
        type: "channelLabelChange",
        data: {
          integrationType: "zalo",
          integrationIdentifier: webhookData.oa_id,
          payload: webhookData,
        },
      })
      return
    }

    // const signature = req.headers.get("X-ZEvent-Signature") ?? ""
    // if (!signature) {
    //   throw new SdkException("Missing webhook signature")
    // }
    // const isValidSignature = await _verifyWebhookSignature(
    //   webhookData,
    //   signature,
    //   config,
    // )
    // if (!isValidSignature) {
    //   throw new SdkException("Invalid webhook signature")
    // }

    if (webhookData.app_id !== config.clientId) {
      throw new SdkException("Invalid app_id in webhook payload")
    }

    const followEvent = parseZaloFollowEvent(webhookData)
    if (
      followEvent &&
      !(await verifyRawWebhookSignature(
        rawBody,
        webhookData,
        req.headers.get("X-ZEvent-Signature") ?? "",
        config,
      ))
    ) {
      // Ack (no retry) but never score an unverifiable follow.
      return
    }
    if (followEvent) {
      await queue.add(CHANNEL_AUDIENCE_EVENT_JOB_NAME, {
        type: CHANNEL_AUDIENCE_EVENT_JOB_NAME,
        data: followEvent,
      })
      return
    }
    if (
      webhookData.event_name === "follow" ||
      webhookData.event_name === "unfollow"
    ) {
      // Malformed (un)follow without oa_id/follower: ack and drop rather
      // than fall into the message path and throw "Missing sender".
      return
    }

    // Message events always carry sender/recipient.
    if (!(webhookData.sender && webhookData.recipient)) {
      throw new SdkException("Missing sender/recipient in message event")
    }

    // Delivery receipts carry only the delivered msg_id — no text or
    // attachments — so routing them to incomingMessage makes the handler
    // throw "No content found" and the job retry forever. There is no
    // delivered-status pipeline yet; ack and drop.
    if (webhookData.event_name === "user_received_message") {
      return
    }

    if (webhookData.event_name === "user_seen_message") {
      await queue.add("contactMarkAsRead", {
        type: "contactMarkAsRead",
        data: {
          integrationType: "zalo",
          integrationIdentifier: webhookData.recipient.id,
          sourceConversationId: webhookData.sender.id,
          payload: webhookData,
        },
      })
    } else {
      const integrationIdentifier = webhookData.event_name.includes("user_send")
        ? webhookData.recipient.id
        : webhookData.sender.id

      await queue.add("incomingMessage", {
        type: "incomingMessage",
        data: {
          integrationType: "zalo",
          integrationIdentifier,
          payload: webhookData,
        },
      })
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error processing webhook"

    throw new SdkException(`Failed to process webhook event: ${errorMessage}`)
  }
}

export const webhookHandler = async ({
  config,
  req,
  queue,
}: HandleRequestProps<ZaloConfig>): Promise<string> => {
  try {
    if (req.method === "POST") {
      await handleWebhookEvent(req, config, queue as ContextQueue)

      return "ok"
    }

    throw new SdkException(`Unsupported HTTP method: ${req.method}`)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown webhook error"

    throw new SdkException(`Webhook processing failed: ${errorMessage}`)
  }
}
