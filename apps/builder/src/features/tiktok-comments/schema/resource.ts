import {
  commentExcludeKeywordsTypes,
  commentHideCommentsSchema,
  commentIncludeKeywordsSchema,
} from "@chatbotx.io/database/partials"
import {
  commentAutomationModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import z from "zod"

const tiktokReplySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("none"),
    value: z.null(),
  }),
  z.object({
    type: z.literal("text"),
    value: z.string(),
    values: z.array(z.object({ value: z.string() })).optional(),
  }),
  z.object({
    type: z.literal("flow"),
    value: z.string(),
  }),
  z.object({
    type: z.literal("AIAgent"),
    value: z.string(),
  }),
])

export const tiktokCommentResource = createSelectSchema(
  commentAutomationModel,
  {
    id: z.string(),
    workspaceId: z.string(),
    post: z.object({
      type: z.enum(["all", "postIds"]),
      value: z.array(z.string()),
    }),
    // No `flow` variant: Comment-to-Message grants one comment-anchored message
    // per comment, and TikTok's flow runner needs a `conversation_id` for every
    // step after the first. The service normalizes a stored `flow` away.
    privateReply: z.discriminatedUnion("type", [
      z.object({ type: z.literal("none"), value: z.null() }),
      z.object({ type: z.literal("text"), value: z.string() }),
      z.object({ type: z.literal("AIAgent"), value: z.string() }),
    ]),
    publicReply: tiktokReplySchema,
    includeKeywords: commentIncludeKeywordsSchema,
    excludeKeywords: z.array(z.string()),
    excludeKeywordsType: commentExcludeKeywordsTypes,
    options: z.object({
      replyToNewContactsOnly: z.boolean(),
      replyOncePerUserPerPost: z.boolean(),
      // Supported, unlike Threads — `business/comment/like/`.
      likeUserComment: z.boolean(),
      replyToUsersWhoCommentedOnOtherPosts: z.boolean(),
      ignoreCommentReplies: z.boolean(),
      trackUserTags: z.boolean(),
    }),
    hideComments: commentHideCommentsSchema,
    replyAfter: z.object({
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
      value: z.number(),
    }),
  },
)

export type TiktokCommentResource = z.infer<typeof tiktokCommentResource>
