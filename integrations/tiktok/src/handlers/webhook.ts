import type { HandleRequestProps } from "@chatbotx.io/sdk"
import { TiktokWebhookException } from "../exception"
import { logger } from "../lib/logger"
import { hmacSha256Hex, timingSafeStringEqual } from "../lib/webhook"
import type { TiktokConfig, TiktokWebhookEvent } from "../schema"
import {
  parseTiktokCommentEventContent,
  TIKTOK_COMMENT_EVENT,
  tiktokWebhookEventSchema,
} from "../schema"

// TikTok recommends rejecting events older than 5 seconds, but per-account
// webhook configuration must be loaded before signature verification. 300s
// still blocks replay while allowing that lookup headroom during live delivery.
const WEBHOOK_TIMESTAMP_WINDOW_SECONDS = 300
// Allow 2s of clock skew between TikTok servers and ours
const WEBHOOK_CLOCK_SKEW_SECONDS = 2

async function verifySignature(
  clientSecret: string,
  signature: string,
  body: string,
): Promise<boolean> {
  const parts = signature.split(",").map((p) => p.trim())
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

/**
 * Routes a `comment.update` event to the right job.
 *
 * One event type carries five different things, told apart by `comment_action`
 * — so only `insert` is "a new comment arrived". The three visibility actions
 * (`set_to_hidden`, `set_to_friends_only`, `set_to_public`) are deliberately
 * dropped: the only job that could take them, `updateIncomingComment`, rewrites
 * the message text, which is not what changed. They are logged so a visibility
 * feature can be built on real traffic rather than guesses.
 *
 * Never throws. TikTok retries a non-2xx webhook, and none of these failures
 * get better on a retry.
 */
async function handleCommentEvent(props: {
  event: TiktokWebhookEvent
  integrationIdentifier: string
  queue: HandleRequestProps<TiktokConfig>["queue"]
}): Promise<void> {
  const { event, integrationIdentifier, queue } = props

  const content = parseTiktokCommentEventContent(event.content)
  if (!content) {
    logger.warn(
      { integrationIdentifier },
      "Unrecognized TikTok comment event content",
    )
    return
  }

  const base = {
    integrationType: "tiktok",
    integrationIdentifier,
  }

  if (content.comment_action === "delete") {
    await queue?.add("deleteIncomingComment", {
      type: "deleteIncomingComment",
      data: { ...base, commentId: content.comment_id },
    })
    return
  }

  if (content.comment_action !== "insert") {
    logger.info(
      {
        integrationIdentifier,
        commentId: content.comment_id,
        action: content.comment_action,
      },
      "Ignoring TikTok comment visibility change",
    )
    return
  }

  // `unique_identifier` is the only thing in the payload that identifies the
  // commenter, and it is what keys their Contact. Falling back to
  // `comment_id` would key the contact by the comment itself, so the same
  // person would become a brand-new Contact on every comment they write —
  // inflating MAC quota and making `replyToNewContactsOnly` fire every time.
  // A comment nobody can be attributed to is dropped instead.
  if (!content.unique_identifier) {
    logger.warn(
      { integrationIdentifier, commentId: content.comment_id },
      "TikTok comment has no unique_identifier; cannot identify commenter",
    )
    return
  }

  await queue?.add("incomingComment", {
    type: "incomingComment",
    data: {
      ...base,
      commentData: {
        commentId: content.comment_id,
        postId: content.video_id,
        parentId: content.parent_comment_id,
        // The webhook carries no open id, name or avatar — only this stable
        // per-commenter identifier. `receiveComment` enriches it from
        // `business/comment/list/` before a contact is created.
        fromId: content.unique_identifier,
        message: content.text,
        // `timestamp` is milliseconds; the envelope's `create_time` is already
        // seconds. Prefer the comment's own time so a webhook delayed by
        // TikTok's five-minute window still reports when it was written.
        createdTime: content.timestamp
          ? Math.floor(content.timestamp / 1000)
          : event.create_time,
      },
    },
  })
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

  if (event.data.event === TIKTOK_COMMENT_EVENT) {
    await handleCommentEvent({
      event: event.data,
      integrationIdentifier,
      queue,
    })
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

  await queue?.add(
    "incomingMessage",
    {
      type: "incomingMessage",
      data: {
        integrationType: "tiktok",
        integrationIdentifier,
        payload: event.data,
      },
    },
    // Add delay for echo events to avoid race condition where echo arrives
    // before the send message API response completes
    event.data.event === "im_send_msg" ? { delay: 2000 } : undefined,
  )

  return "ok"
}
