import {
  commentExcludeKeywordsTypes,
  commentHideCommentsSchema,
  commentIncludeKeywordsSchema,
  commentOptionsSchema,
  commentPostSchema,
  commentReplyAfterSchema,
  commentReplySchema,
} from "@chatbotx.io/database/partials"
import {
  commentAutomationModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import z from "zod"

export const fbCommentResource = createSelectSchema(commentAutomationModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullish(),
  post: commentPostSchema,
  privateReply: commentReplySchema,
  publicReply: commentReplySchema,
  includeKeywords: commentIncludeKeywordsSchema,
  excludeKeywords: z.array(z.string()),
  excludeKeywordsType: commentExcludeKeywordsTypes,
  options: commentOptionsSchema,
  hideComments: commentHideCommentsSchema,
  replyAfter: commentReplyAfterSchema,
})

export const facebookPostSchema = z.object({
  id: z.string(),
  message: z.string().optional(),
  full_picture: z.string().optional(),
  created_time: z.string(),
  permalink_url: z.string().optional(),
  pageId: z.string(),
})
export type FBCommentResource = z.infer<typeof fbCommentResource>
