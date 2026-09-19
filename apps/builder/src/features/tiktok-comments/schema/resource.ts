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
    // Pinned: TikTok has no comment-anchored DM, so a private reply can never
    // be delivered. The service forces this shape on every write.
    privateReply: z.object({
      type: z.literal("none"),
      value: z.null(),
    }),
    publicReply: tiktokReplySchema,
    includeKeywords: z.object({
      type: z.enum(["all", "equal", "contain"]),
      value: z.array(z.string()),
    }),
    excludeKeywords: z.array(z.string()),
    options: z.object({
      replyToNewContactsOnly: z.boolean(),
      replyOncePerUserPerPost: z.boolean(),
      // Supported, unlike Threads — `business/comment/like/`.
      likeUserComment: z.boolean(),
      replyToUsersWhoCommentedOnOtherPosts: z.boolean(),
      ignoreCommentReplies: z.boolean(),
      // Pinned off: TikTok's comment payload carries no tagged users at all.
      trackUserTags: z.boolean(),
    }),
    hideComments: z.object({
      all: z.boolean(),
      hasPhoneNumber: z.boolean(),
      // Answered by `comment-attachment.ts`, which only knows how to ask
      // Messenger — kept readable so legacy rows still parse, never settable.
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
    }),
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
