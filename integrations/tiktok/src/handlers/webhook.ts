import type { HandleRequestProps } from "@chatbotx.io/sdk"
import { TiktokWebhookException } from "../exception"
import { logger } from "../lib/logger"
import { hmacSha256Hex, timingSafeStringEqual } from "../lib/webhook"
import type {
  TiktokCommentEventContent,
  TiktokConfig,
  TiktokWebhookEvent,
} from "../schema"
import {
  parseTiktokCommentEventContent,
  parseTiktokHighIntentCommentContent,
  TIKTOK_COMMENT_EVENT,
  TIKTOK_HIGH_INTENT_COMMENT_EVENT,
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
 * The parent comment a comment answers, or `undefined` when it answers none.
 *
 * TikTok does not omit `parent_comment_id` on a top-level comment — it sends
 * the sentinel `0`, which arrives here as the string `"0"` (the ids are quoted
 * before parsing so snowflakes survive `JSON.parse`). Passing that straight
 * through is what broke the channel: `isCommentReply` in the shared automation
 * loop is built for Meta's composite `{objectId}_{storyId}` ids, and against
 * TikTok's bare snowflakes it reduces to "a parent that is neither the video
 * nor the comment itself means reply" — which `"0"` satisfies. With
 * `ignoreCommentReplies` defaulting to on, every top-level TikTok comment was
 * declined with a `commentIsReply` miss.
 *
 * `comment_type` is TikTok's own explicit discriminator, so it decides whenever
 * it is present; the sentinel check below is the fallback for a payload that
 * omits it. Normalizing here — at the channel boundary that owns the quirk —
 * keeps the Meta heuristic untouched for the other four channels.
 */
function resolveParentCommentId(
  content: TiktokCommentEventContent,
): string | undefined {
  const parentId = content.parent_comment_id
  // `0` is "no parent", never an id — a real one is a 19-digit snowflake.
  if (!parentId || parentId === "0") {
    return
  }
  return content.comment_type === "comment" ? undefined : parentId
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
        parentId: resolveParentCommentId(content),
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

/**
 * Routes `im_receive_high_intent_comment` — TikTok's classifier reporting that
 * a comment expresses purchase intent, which is the ONLY way to obtain a
 * `comment_id` that a `direct_reply` DM will accept.
 *
 * The payload carries no `video_id`, so nothing here can decide which
 * automation the comment belongs to; the worker correlates it against the
 * comment already ingested from `comment.update`. That means this event can
 * legitimately arrive before the comment itself exists — the retry policy
 * below, not this function, is what absorbs that race.
 *
 * Never throws, for the same reason `handleCommentEvent` does not: TikTok
 * retries a non-2xx webhook and an unparseable payload will not improve.
 */
async function handleHighIntentCommentEvent(props: {
  event: TiktokWebhookEvent
  integrationIdentifier: string
  queue: HandleRequestProps<TiktokConfig>["queue"]
}): Promise<void> {
  const { event, integrationIdentifier, queue } = props

  const content = parseTiktokHighIntentCommentContent(event.content)
  if (!content) {
    logger.warn(
      { integrationIdentifier },
      "Unrecognized TikTok high-intent comment event content",
    )
    return
  }

  await queue?.add(
    "tiktokHighIntentComment",
    {
      type: "tiktokHighIntentComment",
      data: {
        integrationType: "tiktok",
        integrationIdentifier,
        commentId: content.comment_id,
        commentText: content.comment_text,
        uniqueIdentifier: content.unique_identifier,
        isFollower: content.is_follower,
        // Same millisecond-vs-seconds rule as `comment.update`: prefer the
        // comment's own time so the 48-hour send window is measured from when
        // it was written, not from when TikTok got round to classifying it.
        commentedAt: content.timestamp
          ? Math.floor(content.timestamp / 1000)
          : event.create_time,
      },
    },
    // The flag this job writes lands on the ingested comment row, which the
    // `COMMENT` subscription may not have delivered yet — TikTok allows itself
    // roughly five minutes there. Six attempts on a 30s exponential backoff
    // covers ~16 minutes, comfortably inside the 48-hour send window.
    {
      attempts: 6,
      backoff: { type: "exponential", delay: 30_000 },
    },
  )
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

  if (event.data.event === TIKTOK_HIGH_INTENT_COMMENT_EVENT) {
    await handleHighIntentCommentEvent({
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
