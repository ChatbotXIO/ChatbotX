import type { Oauth2AuthValue, Oauth2Config } from "@chatbotx.io/sdk"
import { z } from "zod"

export type TiktokConfig = Oauth2Config & {
  openId?: string
}

/** `operation_status` on `business/message/direct_reply/{get,update}/`. */
export type TiktokDirectReplyStatus = "ENABLE" | "DISABLE"

export const TIKTOK_DIRECT_REPLY_TYPE_COMMENT_TO_MESSAGE =
  "COMMENT_TO_MESSAGE" as const

export type TiktokAuthValue = Oauth2AuthValue & {
  metadata: {
    openId: string
    username: string
    displayName: string
    /**
     * Scopes TikTok actually granted, as reported by the token exchange and
     * re-stamped on every refresh. Absent on connections made before comment
     * automation shipped — see `tiktokNeedsReauthorization`.
     */
    scopes?: string[]
    /**
     * Cached Comment-to-Message setting, the switch that decides whether TikTok
     * delivers `im_receive_high_intent_comment` for this account at all.
     *
     * A cache, never the authority: the owner can flip it inside the TikTok app
     * and nothing tells us. Absent means "never checked", which every
     * connection made before this shipped will report — read it as off, and
     * offer the re-check rather than claiming the feature is disabled.
     *
     * Must be preserved across token refresh, which re-stamps `metadata`.
     */
    commentToMessage?: {
      status: TiktokDirectReplyStatus
      /** ISO-8601; when the status above was last read back from TikTok. */
      checkedAt: string
    }
  }
}

export type TiktokActions = Record<string, never>

// ─── Webhook event schemas ────────────────────────────────────────────────────

export const tiktokWebhookEventSchema = z.object({
  client_key: z.string(),
  event: z.string(),
  create_time: z.number(),
  user_openid: z.string(),
  content: z.string(),
})
export type TiktokWebhookEvent = z.infer<typeof tiktokWebhookEventSchema>

export const tiktokDmMessageContentSchema = z.object({
  from: z.string().optional(),
  from_user: z.object({
    id: z.string(),
    role: z.string().optional(),
  }),
  to: z.string().optional(),
  to_user: z
    .object({
      id: z.string(),
      role: z.string().optional(),
    })
    .optional(),
  conversation_id: z.string(),
  message_id: z.string().optional(),
  /**
   * The sender's globally unique user id — TikTok documents it as consistent
   * across its APIs, and it is the same value the `comment.update` webhook
   * sends for a commenter. Observed equal to `from_user.id` on `im_receive_msg`.
   *
   * Deliberately NOT read when resolving the contact: on an `im_send_msg` echo
   * the roles reverse and TikTok does not document whose id this then holds, so
   * `from_user`/`to_user` — whose `role` field says which side is the business —
   * stay the only identity source. See `receiveMessage`.
   */
  unique_identifier: z.string().optional(),
  timestamp: z.number().optional(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  media_url: z.string().optional(),
  /**
   * Present when `type` is `share_post`: a TikTok video shared into the DM.
   *
   * `.catch(undefined)` because this rides along with a real message — a shape
   * we did not anticipate must cost the link preview, never the message itself.
   */
  share_post: z
    .object({
      video_id: z.string(),
      embed_url: z.string().optional(),
    })
    .optional()
    .catch(undefined),
  reply_source_payload: z
    .object({
      reply_source_msg_id: z.string(),
      reply_source_unique_id: z.string(),
    })
    .optional(),
})
export type TiktokDmMessageContent = z.infer<
  typeof tiktokDmMessageContentSchema
>

// ─── Comment webhook (`comment.update`) ───────────────────────────────────────

export const TIKTOK_COMMENT_EVENT = "comment.update"

/**
 * Comment-to-Message. Despite naming a comment, this event rides the
 * `DIRECT_MESSAGE` subscription, not the `COMMENT` one — see
 * `TIKTOK_DIRECT_MESSAGE_EVENT_TYPE` in `apis/webhook`.
 */
export const TIKTOK_HIGH_INTENT_COMMENT_EVENT = "im_receive_high_intent_comment"

/**
 * What happened to the comment. One event type covers all five, so "a new
 * comment arrived" is `insert` specifically — not merely the event firing.
 */
export const tiktokCommentActions = z.enum([
  "insert",
  "delete",
  "set_to_hidden",
  "set_to_friends_only",
  "set_to_public",
])
export type TiktokCommentAction = z.infer<typeof tiktokCommentActions>

/**
 * The ids TikTok sends as JSON *numbers* inside `content`, despite being
 * 19-digit snowflakes far beyond `Number.MAX_SAFE_INTEGER`.
 *
 * `JSON.parse` would silently round them — `7247303576418566913` comes back as
 * `7247303576418566000` — and every later API call would then address a comment
 * that does not exist, with no error anywhere to explain it. They are quoted
 * back into strings before parsing; see `parseTiktokCommentEventContent`.
 *
 * `timestamp` is deliberately not in this list: a millisecond epoch is only 13
 * digits and survives `JSON.parse` intact.
 */
const SNOWFLAKE_ID_FIELDS = ["comment_id", "video_id", "parent_comment_id"]

/**
 * Quotes the listed numeric ids in a raw JSON string so `JSON.parse` keeps them
 * intact. Shared by every `content` parser on this channel — each passes the
 * fields its own payload carries, because a field quoted where it is genuinely
 * a number would come back as a string and fail its schema.
 */
const quoteSnowflakeIds = (json: string, fields: string[]): string =>
  json.replace(
    new RegExp(`"(${fields.join("|")})"\\s*:\\s*(\\d+)`, "g"),
    '"$1":"$2"',
  )

export const tiktokCommentEventContentSchema = z.object({
  comment_id: z.string(),
  video_id: z.string(),
  /**
   * NOT a "present only on replies" flag. A production `insert` for a
   * top-level comment (2026-09-21) carries `"parent_comment_id":0` — a sentinel
   * meaning "no parent", which `quoteSnowflakeIds` then hands on as the string
   * `"0"`. Treating its presence as "this is a reply" reads every top-level
   * comment as one; `resolveParentCommentId` (`handlers/webhook.ts`) is the
   * only thing that may turn this field into a parent id.
   *
   * `nullish` rather than `optional`: a `null` here would fail the whole
   * object, and a payload that cannot be parsed is a comment dropped before it
   * even reaches the inbox.
   */
  parent_comment_id: z.string().nullish(),
  /**
   * TikTok's own explicit discriminator, and the only trustworthy one on this
   * channel — the id-shape heuristic Meta needs cannot work here, where every
   * id is a bare snowflake.
   */
  comment_type: z.enum(["comment", "reply"]).optional(),
  comment_action: tiktokCommentActions,
  /** Millisecond epoch, unlike the envelope's `create_time` (seconds). */
  timestamp: z.number().optional(),
  /** Stable per-commenter id; the only identity the webhook carries. */
  unique_identifier: z.string().optional(),
  text: z.string().optional(),
})
export type TiktokCommentEventContent = z.infer<
  typeof tiktokCommentEventContentSchema
>

/**
 * Parses the `content` string of a `comment.update` event, preserving the
 * snowflake ids `JSON.parse` would otherwise round away.
 *
 * Returns `undefined` rather than throwing: a webhook that cannot be understood
 * must still be answered 200, or TikTok retries it forever.
 */
export const parseTiktokCommentEventContent = (
  content: string,
): TiktokCommentEventContent | undefined => {
  let parsed: unknown
  try {
    parsed = JSON.parse(quoteSnowflakeIds(content, SNOWFLAKE_ID_FIELDS))
  } catch {
    return
  }

  const result = tiktokCommentEventContentSchema.safeParse(parsed)
  return result.success ? result.data : undefined
}

/**
 * The `content` of an `im_receive_high_intent_comment` event — TikTok's own
 * classifier telling us a comment expresses purchase intent, which is the ONLY
 * way to obtain a `comment_id` that `business/message/send/` will accept as a
 * `direct_reply`.
 *
 * Deliberately narrower than the documented payload. `from_user`/`to_user` are
 * not modelled: nothing reads them (the commenter is keyed by
 * `unique_identifier`, the business by `config.openId`), and their nested `id`
 * is the one field where a snowflake could be rounded without any error to show
 * for it.
 *
 * Note this event carries NO `video_id` — see the high-intent worker handler for
 * how the comment is correlated back to its post.
 */
export const tiktokHighIntentCommentContentSchema = z.object({
  comment_id: z.string(),
  comment_text: z.string().optional(),
  /** Stable per-commenter id, the same namespace `comment.update` reports. */
  unique_identifier: z.string().optional(),
  is_follower: z.boolean().optional(),
  /** Millisecond epoch, unlike the envelope's `create_time` (seconds). */
  timestamp: z.number().optional(),
})
export type TiktokHighIntentCommentContent = z.infer<
  typeof tiktokHighIntentCommentContentSchema
>

/**
 * `comment_id` is documented as a string here but as a NUMBER on
 * `comment.update`, so it is quoted defensively — the failure mode is a rounded
 * id addressing a comment that does not exist, with nothing in any log to say
 * so. `unique_identifier` gets the same treatment for the same reason.
 *
 * Returns `undefined` rather than throwing, like its `comment.update` sibling.
 */
export const parseTiktokHighIntentCommentContent = (
  content: string,
): TiktokHighIntentCommentContent | undefined => {
  let parsed: unknown
  try {
    parsed = JSON.parse(
      quoteSnowflakeIds(content, ["comment_id", "unique_identifier"]),
    )
  } catch {
    return
  }

  const result = tiktokHighIntentCommentContentSchema.safeParse(parsed)
  return result.success ? result.data : undefined
}

// ─── API response schemas ─────────────────────────────────────────────────────

// business-api.tiktok.com wraps every response as { code, message, data },
// distinct from open.tiktokapis.com's { data, error } (TiktokApiResponse below)
// — a rejection still comes back HTTP 200, so `code` must be checked explicitly.
export type BusinessApiResponse<T> = {
  code: number
  message?: string
  data: T
}

export const tiktokApiResponseSchema = z.object({
  data: z.unknown(),
  error: z
    .object({
      code: z.union([z.string(), z.number()]).optional(),
      message: z.string().optional(),
      log_id: z.string().optional(),
    })
    .optional(),
})
export type TiktokApiResponse<T = unknown> = {
  data: T
  error?: { code?: string | number; message?: string; log_id?: string }
}

export type TiktokUserInfo = {
  open_id: string
  display_name: string
  avatar_url: string
  username: string
}

export type TiktokTemplateButton = {
  type: "REPLY"
  title: string
  id: string
}

export type TiktokMessageTemplate =
  | { type: "QA_BUTTON_CARD"; title: string; buttons: TiktokTemplateButton[] }
  | { type: "QA_LINK_CARD"; title: string; buttons: TiktokTemplateButton[] }

// ─── Comment API types ────────────────────────────────────────────────────────

/** Visibility filter accepted by the comment list endpoints. */
export type TiktokCommentStatus = "PUBLIC" | "HIDDEN" | "ALL"
/** `business/comment/like/` — like or take a like back. */
export type TiktokCommentLikeAction = "LIKE" | "UNLIKE"
/** `business/comment/hide/` — hide from everyone but the author, or restore. */
export type TiktokCommentHideAction = "HIDE" | "UNHIDE"

/**
 * A comment or a reply on an owned video.
 *
 * Every id comes back as a string here, unlike the `comment.update` webhook,
 * which sends the same ids as JSON numbers wide enough to lose precision — so
 * only the webhook needs snowflake-safe parsing, not these responses.
 *
 * `parent_comment_id` is documented as present on replies only. Unverified
 * against a real response, and the same claim turned out to be false for the
 * `comment.update` webhook, which sends `0` on a top-level comment — so treat a
 * truthy value here as "maybe a parent" until a live response settles it.
 * Nothing reads this field today.
 */
export type TiktokComment = {
  comment_id: string
  video_id: string
  user_id?: string
  unique_identifier?: string
  create_time?: number
  text?: string
  image_url?: string
  likes?: number
  replies?: number
  /** True when the comment was written by the account that owns the video. */
  owner?: boolean
  liked?: boolean
  pinned?: boolean
  status?: TiktokCommentStatus
  username?: string
  display_name?: string
  profile_image?: string
  parent_comment_id?: string
  reply_list?: TiktokComment[]
}

export type TiktokCommentListResult = {
  comments?: TiktokComment[]
  cursor?: number
  has_more?: boolean
}

export type TiktokCommentImageUploadResult = {
  image_uri: string
  width?: number
  height?: number
}

/** Shared paging/sorting options of the two comment list endpoints. */
export type TiktokCommentListOptions = {
  status?: TiktokCommentStatus
  sortField?: string
  sortType?: "ASC" | "DESC"
  cursor?: number
  maxCount?: number
}

// ─── Video API types ──────────────────────────────────────────────────────────

/**
 * A public video post on the connected account.
 *
 * `item_id` is the post id — the very same id every comment endpoint calls
 * `video_id`, and the one `comment.update` reports as `video_id`.
 */
export type TiktokVideo = {
  item_id: string
  caption?: string
  thumbnail_url?: string
  share_url?: string
  embed_url?: string
  media_type?: string
  is_ad?: boolean
  create_time?: number
  comments?: number
  likes?: number
}

export type TiktokVideoListResult = {
  videos?: TiktokVideo[]
  cursor?: number
  has_more?: boolean
}

export type TiktokSendMessageRequest =
  | {
      business_id: string
      recipient_type: "CONVERSATION"
      recipient: string
      message_type: "TEXT"
      text: { body: string }
    }
  | {
      business_id: string
      recipient_type: "CONVERSATION"
      recipient: string
      message_type: "IMAGE"
      image: { media_id: string }
    }
  | {
      business_id: string
      recipient_type: "CONVERSATION"
      recipient: string
      message_type: "TEMPLATE"
      template: TiktokMessageTemplate
    }
  /**
   * Comment-to-Message: a DM anchored to a comment rather than to a
   * conversation. `recipient_type`/`recipient` are NOT supported alongside
   * `direct_reply` — TikTok rejects a request carrying both — which is what
   * makes this the one send that needs no pre-existing `conversation_id`.
   */
  | {
      business_id: string
      direct_reply: {
        reply_type: "COMMENT_REPLY"
        comment_reply: { comment_id: string }
      }
      message_type: "TEXT"
      text: { body: string }
    }
