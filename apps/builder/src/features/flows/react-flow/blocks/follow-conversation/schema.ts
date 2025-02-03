import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const followConversationBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.FollowConversation),
})

export type FollowConversationBlockSchema = z.infer<
  typeof followConversationBlockSchema
>

export const followConversationBlockDefaultValue =
  (): FollowConversationBlockSchema => ({
    id: createId(),
    actionType: ActionType.FollowConversation,
  })
