import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const archiveConversationBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.ArchiveConversation),
})

export type ArchiveConversationBlockSchema = z.infer<
  typeof archiveConversationBlockSchema
>

export const archiveConversationBlockDefaultValue =
  (): ArchiveConversationBlockSchema => ({
    id: createId(),
    actionType: ActionType.ArchiveConversation,
  })
