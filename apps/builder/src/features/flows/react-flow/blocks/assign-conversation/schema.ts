import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const assignConversationBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.AssignConversation),
  recipientId: z.string().cuid2(),
  recipientName: z.string().nullable(),
})

export type AssignConversationBlockSchema = z.infer<
  typeof assignConversationBlockSchema
>

export const assignConversationBlockDefaultValue =
  (): AssignConversationBlockSchema => ({
    id: createId(),
    actionType: ActionType.AssignConversation,
    recipientId: "",
    recipientName: "",
  })
