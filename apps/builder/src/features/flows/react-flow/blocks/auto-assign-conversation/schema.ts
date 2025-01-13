import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const autoAssignConversationBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.AutoAssignConversation),
  recipients: z.array(z.string().cuid2()).min(1),
})

export type AutoAssignConversationBlockSchema = z.infer<
  typeof autoAssignConversationBlockSchema
>

export const autoAssignConversationBlockDefaultValue =
  (): AutoAssignConversationBlockSchema => ({
    id: createId(),
    actionType: ActionType.AutoAssignConversation,
    recipients: [],
  })
