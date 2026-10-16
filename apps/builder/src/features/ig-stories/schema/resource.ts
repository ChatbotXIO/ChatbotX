import {
  commentIncludeKeywordsSchema,
  commentReplySchema,
  igStoryAutomationTriggers,
  igStoryTargetSchema,
} from "@chatbotx.io/database/partials"
import {
  createSelectSchema,
  igStoryAutomationModel,
} from "@chatbotx.io/database/schema"
import z from "zod"
import { automationInboxIdResourceSchema } from "@/features/shared/comment-automation/schema/account"

export const igStoryResource = createSelectSchema(igStoryAutomationModel, {
  id: z.string(),
  workspaceId: z.string(),
  inboxId: automationInboxIdResourceSchema,
  folderId: z.string().nullish(),
  trigger: igStoryAutomationTriggers,
  story: igStoryTargetSchema,
  reply: commentReplySchema,
  includeKeywords: commentIncludeKeywordsSchema,
})
export type IgStoryResource = z.infer<typeof igStoryResource>
