import type { Oauth2AuthValue, Oauth2Config } from "@chatbotx.io/sdk"
import { z } from "zod"

export type TiktokConfig = Oauth2Config & {
  openId?: string
}

export type TiktokAuthValue = Oauth2AuthValue & {
  metadata: {
    openId: string
    username: string
    displayName: string
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
  unique_identifier: z.string().optional(),
  timestamp: z.number().optional(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  media_url: z.string().optional(),
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

const SNOWFLAKE_ID_RE = new RegExp(
  `"(${SNOWFLAKE_ID_FIELDS.join("|")})"\\s*:\\s*(\\d+)`,
  "g",
)

export const tiktokCommentEventContentSchema = z.object({
  comment_id: z.string(),
  video_id: z.string(),
  /** Present on replies only — this is what tells a reply from a comment. */
  parent_comment_id: z.string().optional(),
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
    parsed = JSON.parse(content.replace(SNOWFLAKE_ID_RE, '"$1":"$2"'))
  } catch {
    return
  }

  const result = tiktokCommentEventContentSchema.safeParse(parsed)
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
 * `parent_comment_id` is present on replies only; it is what distinguishes a
 * reply from a top-level comment.
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
