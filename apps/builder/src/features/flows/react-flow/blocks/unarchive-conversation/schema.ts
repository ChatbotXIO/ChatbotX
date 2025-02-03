import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const unArchiveConversationBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.UnArchiveConversation),
})

export type UnArchiveConversationBlockSchema = z.infer<
  typeof unArchiveConversationBlockSchema
>

export const unArchiveConversationBlockDefaultValue =
  (): UnArchiveConversationBlockSchema => ({
    id: createId(),
    actionType: ActionType.UnArchiveConversation,
  })
