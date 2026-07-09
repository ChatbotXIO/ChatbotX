import { z } from "zod"

export const fbCommentAutomationTypes = z.enum(["messenger", "instagram"])
export type FBCommentAutomationType = z.infer<typeof fbCommentAutomationTypes>

export const fbCommentPostSchema = z.object({
  type: z.enum(["published", "ads", "reels", "postIds", "all"]),
  value: z.array(z.string()),
})
export type FBCommentPost = z.infer<typeof fbCommentPostSchema>

export const fbCommentReplySchema = z.object({
  type: z.enum(["AIAgent", "text", "flow", "none"]),
  value: z.string().nullable(),
})
export type FBCommentReply = z.infer<typeof fbCommentReplySchema>

export const fbCommentIncludeKeywordsSchema = z.object({
  type: z.enum(["all", "equal", "contain"]),
  value: z.array(z.string()),
})
export type FBCommentIncludeKeywords = z.infer<
  typeof fbCommentIncludeKeywordsSchema
>

export const fbCommentOptionsSchema = z.object({
  replyToNewContactsOnly: z.boolean(),
  replyOncePerUserPerPost: z.boolean(),
  likeUserComment: z.boolean(),
  replyToUsersWhoCommentedOnOtherPosts: z.boolean(),
  ignoreCommentReplies: z.boolean(),
  trackUserTags: z.boolean(),
})
export type FBCommentOptions = z.infer<typeof fbCommentOptionsSchema>

export const fbCommentHideCommentsSchema = z.object({
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
export type FBCommentHideComments = z.infer<typeof fbCommentHideCommentsSchema>

export const fbCommentReplyAfterSchema = z.object({
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
export type FBCommentReplyAfter = z.infer<typeof fbCommentReplyAfterSchema>
