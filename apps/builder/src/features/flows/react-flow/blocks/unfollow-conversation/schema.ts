import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const unfollowConversationBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.UnfollowConversation),
})

export type UnfollowConversationBlockSchema = z.infer<
  typeof unfollowConversationBlockSchema
>

export const unfollowConversationBlockDefaultValue =
  (): UnfollowConversationBlockSchema => ({
    id: createId(),
    actionType: ActionType.UnfollowConversation,
  })
