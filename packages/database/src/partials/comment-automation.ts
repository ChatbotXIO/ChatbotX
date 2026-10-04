import { z } from "zod"

export const commentAutomationTypes = z.enum([
  "messenger",
  "instagram",
  "instagramFacebook",
  "threads",
  "tiktok",
])
export type CommentAutomationType = z.infer<typeof commentAutomationTypes>

export const igCommentAutomationTypes = z.enum([
  "instagram",
  "instagramFacebook",
])
export type IgCommentAutomationType = z.infer<typeof igCommentAutomationTypes>

/**
 * The channels that can answer a comment with a comment-anchored DM.
 *
 * Kept here rather than next to the dispatch, because it is not only the worker
 * that needs the answer: the analytics counters are scoped to the DM (see
 * `countsTowardStats`), so a channel without one has to count its public
 * comment replies instead or every column on its list row reads zero forever.
 * `packages/analytics` cannot import the worker's
 * `PRIVATE_REPLY_TEXT_SENDERS` — that map pulls in every Meta integration — so
 * the capability lives with the channel enum it keys off, and
 * `comment-automation.test.ts` asserts the two never drift.
 *
 * An allowlist, like `CHANNELS_WITH_COMMENT_LIKE`: a channel added without a
 * decision here should default to "cannot", not inherit a DM by omission.
 */
const COMMENT_AUTOMATION_CHANNELS_WITH_PRIVATE_REPLY =
  new Set<CommentAutomationType>([
    "messenger",
    "instagram",
    "instagramFacebook",
    // TikTok Comment-to-Message: `direct_reply` addresses the DM by comment id,
    // so no conversation has to exist first. It only fires for comments TikTok
    // itself flags as high intent, which makes the DM rarer here than on Meta —
    // but it is still the half these counters measure, because it is the half
    // that carries a delivery receipt.
    "tiktok",
  ])

/**
 * Whether the channel can answer a comment with a private DM. Threads is the
 * only one that cannot: its API has no DM endpoint of any kind.
 */
export function commentAutomationChannelSupportsPrivateReply(
  type: CommentAutomationType,
): boolean {
  return COMMENT_AUTOMATION_CHANNELS_WITH_PRIVATE_REPLY.has(type)
}

/**
 * The channels that expose enough about a comment to tell it carries a GIF:
 * Facebook's comment `attachment.type` (`animated_image_*`) and Threads'
 * reply `gif_url`. Instagram and TikTok deliver comment text only, so the
 * builder hides the switch there and the service pins `hasGif` off on write —
 * otherwise a public-API or MCP client could store a switch that never
 * matches.
 *
 * An allowlist, like the private-reply one above: a new channel defaults to
 * "cannot".
 */
const COMMENT_AUTOMATION_CHANNELS_WITH_GIF_DETECTION =
  new Set<CommentAutomationType>(["messenger", "threads"])

export function commentAutomationChannelSupportsHideGif(
  type: CommentAutomationType,
): boolean {
  return COMMENT_AUTOMATION_CHANNELS_WITH_GIF_DETECTION.has(type)
}

export const commentPostSchema = z.object({
  type: z
    .enum(["published", "ads", "reels", "postIds", "all", "live"])
    .describe(
      "Which posts the automation watches: `postIds` (only the posts listed in `value`), `live` (live videos), or `all`/`published`/`ads`/`reels` (any post; `value` unused, send `[]`).",
    ),
  value: z
    .array(z.string())
    .describe(
      "Post or media ids to watch. Used only when `type` is `postIds`; get them from the channel's list-posts/list-media route. Send `[]` otherwise.",
    ),
})
export type CommentPost = z.infer<typeof commentPostSchema>

/**
 * A Live automation answers comments made on any of the account's live
 * broadcasts — and ONLY those: an `all` automation skips a live comment, so a
 * viewer is never answered twice (see `matchPost` in the worker).
 */
export function isLiveCommentAutomation(post: Pick<CommentPost, "type">) {
  return post.type === "live"
}

export type LiveCommentCapabilities = {
  publicReply: boolean
  likeComment: boolean
  hideComments: boolean
  /** Reply delays are allowed — false where the reply window can close mid-wait. */
  replyDelay: boolean
  /** Whether a live comment can itself be a reply to another comment. */
  commentReplies: boolean
}

const FULL_LIVE_CAPABILITIES: LiveCommentCapabilities = {
  publicReply: true,
  likeComment: true,
  hideComments: true,
  replyDelay: true,
  commentReplies: true,
}

/**
 * What a Live automation can do per channel. Meta's Instagram Live API is
 * private-reply-only: "You cannot reply to comments on a live video", live
 * comments cannot be hidden (they are only readable while broadcasting), there
 * is no comment-like API, and the private reply is accepted only while the
 * broadcast is running — so any reply delay risks landing after it ends.
 * Facebook Live comments are ordinary Page comments.
 */
export function liveCommentCapabilities(
  type: CommentAutomationType,
): LiveCommentCapabilities {
  if (type === "instagram" || type === "instagramFacebook") {
    return {
      publicReply: false,
      likeComment: false,
      hideComments: false,
      replyDelay: false,
      commentReplies: false,
    }
  }
  return FULL_LIVE_CAPABILITIES
}

/**
 * "Process missed comments" replays one post's recent comments, so it is only
 * offered on an automation that targets exactly one specific post. Shared by
 * the builder (to hide the action) and the service (to reject the call).
 */
export function canProcessMissedComments(post: CommentPost): boolean {
  return post.type === "postIds" && post.value.length === 1
}

export const commentReplyTypes = z.enum(["AIAgent", "text", "flow", "none"])
export type CommentReplyType = z.infer<typeof commentReplyTypes>

/** Upper bound on a `text` reply's message list, mirrored by the builder form. */
export const COMMENT_REPLY_MAX_TEXTS = 10

export const commentReplySchema = z.object({
  type: commentReplyTypes.describe(
    "Reply kind: `text` (message text), `flow` (run a flow), `AIAgent` (an AI agent writes the reply) or `none` (no reply).",
  ),
  value: z
    .string()
    .nullable()
    .describe(
      "Reply payload by `type`: the message text for `text`, a flow id for `flow` (from `flows.list`), an AI agent id for `AIAgent` (from `aiAgents.list`), or null for `none`.",
    ),
  /**
   * A `text` reply's messages, one public comment reply each. Optional because
   * every row written before this existed carries only `value` — read both
   * through {@link resolveReplyTexts}, never directly.
   *
   * Objects rather than bare strings: this same schema is the form's, the
   * request's and the jsonb column's, and `useFieldArray` needs an object to
   * mint the stable `field.id` the editor is keyed by. Same shape Keywords
   * uses (`features/automated-response/schema/action.ts`).
   *
   * Only `publicReply` fills this in. A private reply stays single-message —
   * Meta accepts one comment-anchored DM per comment.
   */
  values: z
    .array(
      z.object({
        value: z.string().describe("One reply message text."),
      }),
    )
    .max(COMMENT_REPLY_MAX_TEXTS)
    .optional()
    .describe(
      "Public `text` replies only: up to 10 alternative messages, one is a separate public reply each. When set it takes precedence over `value`.",
    ),
})
export type CommentReply = z.infer<typeof commentReplySchema>

/**
 * The messages a reply will actually send, newest shape first and falling back
 * to the legacy single `value`. THE one place that knows the fallback rule —
 * `willSendReply` and `executePublicReply` must both read through it or they
 * disagree about whether an automation replies at all.
 */
export const resolveReplyTexts = (reply: CommentReply): string[] =>
  (reply.values?.map((item) => item.value) ?? [reply.value ?? ""])
    .map((text) => text.trim())
    .filter(Boolean)

/**
 * Keeps `value` and `values` describing the same thing on every write.
 *
 * Without it the two drift: a client that PATCHes only `value` on a row that
 * already has `values` would be ignored outright, because `resolveReplyTexts`
 * prefers `values` — a silent no-op, the worst kind. Mirroring on the way in
 * also means anything still reading `value` (template adapter, public API)
 * keeps seeing real content.
 */
export const normalizeReplyTexts = (reply: CommentReply): CommentReply => {
  if (reply.type !== "text") {
    return reply
  }
  if (reply.values) {
    return { ...reply, value: reply.values[0]?.value ?? "" }
  }
  return { ...reply, values: [{ value: reply.value ?? "" }] }
}

/** Upper bound on the "enough mentions" filter, mirrored by the builder form. */
export const COMMENT_MENTION_COUNT_MAX = 5

export const commentIncludeKeywordsTypes = z.enum([
  "all",
  "equal",
  "contain",
  "mentions",
])
export type CommentIncludeKeywordsType = z.infer<
  typeof commentIncludeKeywordsTypes
>

export const commentIncludeKeywordsSchema = z.object({
  type: commentIncludeKeywordsTypes.describe(
    "Match mode: `all` (every comment), `equal` (comment equals a keyword), `contain` (comment contains a keyword) or `mentions` (comment tags at least `mentionCount` accounts). Matching ignores case and accents.",
  ),
  value: z
    .array(z.string())
    .describe(
      "Keywords for `equal`/`contain`; any one matching is enough. Send `[]` for `all` and `mentions`.",
    ),
  /** Only read when `type` is `mentions`. */
  mentionCount: z.coerce
    .number()
    .int()
    .min(1)
    .max(COMMENT_MENTION_COUNT_MAX)
    .optional()
    .describe(
      "Minimum number of accounts the comment must tag (1-5). Only used when `type` is `mentions`; defaults to 1.",
    ),
})
export type CommentIncludeKeywords = z.infer<
  typeof commentIncludeKeywordsSchema
>
export const commentExcludeKeywordsTypes = z.enum(["equal", "contain"])
export type CommentExcludeKeywordsType = z.infer<
  typeof commentExcludeKeywordsTypes
>

export const commentOptionsSchema = z.object({
  replyToNewContactsOnly: z
    .boolean()
    .describe(
      "Only reply when the commenter is a new contact (no earlier conversation).",
    ),
  replyOncePerUserPerPost: z
    .boolean()
    .describe("Reply at most once per commenter on each post."),
  likeUserComment: z
    .boolean()
    .describe(
      "Also like the comment when replying (where the channel supports likes).",
    ),
  replyToUsersWhoCommentedOnOtherPosts: z
    .boolean()
    .describe(
      "When false, skip commenters this automation already replied to on a different post.",
    ),
  ignoreCommentReplies: z
    .boolean()
    .describe(
      "Ignore replies to other comments; only react to top-level comments.",
    ),
  trackUserTags: z
    .boolean()
    .describe(
      "Count the accounts tagged in each comment into the contact's running totals, exposed as `{{total_tagged}}` and `{{total_new_tagged}}`. Comments are only processed for this automation when on.",
    ),
})
export type CommentOptions = z.infer<typeof commentOptionsSchema>

export const commentHideCommentsSchema = z.object({
  all: z.boolean().describe("Hide every matching comment."),
  hasPhoneNumber: z
    .boolean()
    .describe("Hide comments containing a phone number."),
  hasImage: z
    .boolean()
    .describe("Hide comments with an image attachment (Facebook only)."),
  hasVideo: z
    .boolean()
    .describe("Hide comments with a video attachment (Facebook only)."),
  hasLink: z.boolean().describe("Hide comments containing a link."),
  hasKeywords: z
    .boolean()
    .describe("Hide comments containing any word in `keywords`."),
  /**
   * Optional because every row written before these existed lacks the key —
   * absent reads as off. GIF detection needs attachment data only some
   * channels expose (see `commentAutomationChannelSupportsHideGif`).
   */
  hasGif: z
    .boolean()
    .optional()
    .describe(
      "Hide comments containing a GIF. Only Facebook and Threads detect GIFs; ignored on other channels. Omitted means off.",
    ),
  hasEmoji: z
    .boolean()
    .optional()
    .describe("Hide comments containing an emoji. Omitted means off."),
  keywords: z
    .array(z.string())
    .describe("Words that trigger hiding when `hasKeywords` is true."),
  showCommentsAfter: z
    .enum([
      "none",
      "6h",
      "12h",
      "1d",
      "2d",
      "3d",
      "4d",
      "5d",
      "6d",
      "7d",
      "8d",
      "9d",
      "10d",
    ])
    .describe(
      "Unhide hidden comments after this delay: `none` (keep hidden), `6h`, `12h`, or `1d` to `10d`.",
    ),
})
export type CommentHideComments = z.infer<typeof commentHideCommentsSchema>

export const commentReplyAfterSchema = z.object({
  type: z
    .enum([
      "immediately",
      "seconds",
      "minutes",
      "hours",
      "randomWithin3Minutes",
      "randomWithin5Minutes",
      "randomWithin10Minutes",
      "randomWithin20Minutes",
      "randomWithin30Minutes",
      "randomWithin60Minutes",
    ])
    .describe(
      "Delay mode: `immediately`, a fixed wait in `seconds`/`minutes`/`hours` (amount in `value`), or a random wait up to the stated number of minutes.",
    ),
  value: z.coerce
    .number()
    .describe(
      "Wait amount in the unit named by `type`. Only used for `seconds`, `minutes` and `hours`; send 0 otherwise.",
    ),
})
export type CommentReplyAfter = z.infer<typeof commentReplyAfterSchema>
