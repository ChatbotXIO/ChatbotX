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
