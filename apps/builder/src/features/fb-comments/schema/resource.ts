import {
  fbCommentHideCommentsSchema,
  fbCommentIncludeKeywordsSchema,
  fbCommentOptionsSchema,
  fbCommentPostSchema,
  fbCommentReplyAfterSchema,
  fbCommentReplySchema,
} from "@chatbotx.io/database/partials"
import {
  createSelectSchema,
  fbCommentAutomationModel,
} from "@chatbotx.io/database/schema"
import z from "zod"

export const fbCommentResource = createSelectSchema(fbCommentAutomationModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullish(),
  post: fbCommentPostSchema,
  privateReply: fbCommentReplySchema,
  publicReply: fbCommentReplySchema,
  includeKeywords: fbCommentIncludeKeywordsSchema,
  excludeKeywords: z.array(z.string()),
  options: fbCommentOptionsSchema,
  hideComments: fbCommentHideCommentsSchema,
  replyAfter: fbCommentReplyAfterSchema,
})
export type FBCommentResource = z.infer<typeof fbCommentResource>
