import {
  fbCommentIncludeKeywordsSchema,
  fbCommentReplySchema,
  igStoryTargetSchema,
} from "@chatbotx.io/database/partials"
import {
  createSelectSchema,
  igStoryAutomationModel,
} from "@chatbotx.io/database/schema"
import z from "zod"

export const igStoryResource = createSelectSchema(igStoryAutomationModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullish(),
  story: igStoryTargetSchema,
  reply: fbCommentReplySchema,
  includeKeywords: fbCommentIncludeKeywordsSchema,
})
export type IgStoryResource = z.infer<typeof igStoryResource>
