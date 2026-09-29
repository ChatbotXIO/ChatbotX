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

const threadsReplySchema = z.discriminatedUnion("type", [
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

export const threadsCommentResource = createSelectSchema(
  commentAutomationModel,
  {
    id: z.string(),
    workspaceId: z.string(),
    post: z.object({
      type: z.enum(["all", "postIds"]),
      value: z.array(z.string()),
    }),
    privateReply: z.object({
      type: z.literal("none"),
      value: z.null(),
    }),
    publicReply: threadsReplySchema,
    includeKeywords: commentIncludeKeywordsSchema,
    excludeKeywords: z.array(z.string()),
    excludeKeywordsType: commentExcludeKeywordsTypes,
    options: z.object({
      replyToNewContactsOnly: z.boolean(),
      replyOncePerUserPerPost: z.boolean(),
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

export type ThreadsCommentResource = z.infer<typeof threadsCommentResource>
