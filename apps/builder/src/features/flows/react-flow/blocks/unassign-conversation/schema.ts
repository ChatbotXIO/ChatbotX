import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const unassignConversationBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.UnassignConversation),
})

export type UnassignConversationBlockSchema = z.infer<
  typeof unassignConversationBlockSchema
>

export const unassignConversationBlockDefaultValue =
  (): UnassignConversationBlockSchema => ({
    id: createId(),
    actionType: ActionType.UnassignConversation,
  })
