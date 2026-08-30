import {
  createSelectSchema,
  savedReplyModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const publicSavedReplyResource = createSelectSchema(savedReplyModel, {
  id: z.string(),
  workspaceId: z.string(),
})
export type PublicSavedReplyResource = z.infer<typeof publicSavedReplyResource>

export const publicListSavedRepliesResponse = z.object({
  data: z.array(publicSavedReplyResource),
})
export type PublicListSavedRepliesResponse = z.infer<
  typeof publicListSavedRepliesResponse
>
