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

export const igCommentResource = createSelectSchema(commentAutomationModel, {
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
export type IgCommentResource = z.infer<typeof igCommentResource>
