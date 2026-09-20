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

export const commentPostSchema = z.object({
  type: z.enum(["published", "ads", "reels", "postIds", "all"]),
  value: z.array(z.string()),
})
export type CommentPost = z.infer<typeof commentPostSchema>

export const commentReplyTypes = z.enum(["AIAgent", "text", "flow", "none"])
export type CommentReplyType = z.infer<typeof commentReplyTypes>

/** Upper bound on a `text` reply's message list, mirrored by the builder form. */
export const COMMENT_REPLY_MAX_TEXTS = 10

export const commentReplySchema = z.object({
  type: commentReplyTypes,
  value: z.string().nullable(),
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
    .array(z.object({ value: z.string() }))
    .max(COMMENT_REPLY_MAX_TEXTS)
    .optional(),
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

export const commentIncludeKeywordsSchema = z.object({
  type: z.enum(["all", "equal", "contain"]),
  value: z.array(z.string()),
})
export type CommentIncludeKeywords = z.infer<
  typeof commentIncludeKeywordsSchema
>

export const commentOptionsSchema = z.object({
  replyToNewContactsOnly: z.boolean(),
  replyOncePerUserPerPost: z.boolean(),
  likeUserComment: z.boolean(),
  replyToUsersWhoCommentedOnOtherPosts: z.boolean(),
  ignoreCommentReplies: z.boolean(),
  trackUserTags: z.boolean(),
})
export type CommentOptions = z.infer<typeof commentOptionsSchema>

export const commentHideCommentsSchema = z.object({
  all: z.boolean(),
  hasPhoneNumber: z.boolean(),
  hasImage: z.boolean(),
  hasVideo: z.boolean(),
  hasLink: z.boolean(),
  hasKeywords: z.boolean(),
  keywords: z.array(z.string()),
  showCommentsAfter: z.enum([
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
  ]),
})
export type CommentHideComments = z.infer<typeof commentHideCommentsSchema>

export const commentReplyAfterSchema = z.object({
  type: z.enum([
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
  ]),
  value: z.coerce.number(),
})
export type CommentReplyAfter = z.infer<typeof commentReplyAfterSchema>
