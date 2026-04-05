import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const unfollowConversationStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.unfollowConversation),
})

export type UnfollowConversationStepSchema = z.infer<
  typeof unfollowConversationStepSchema
>

export const unfollowConversationStepDefaultFn =
  (): UnfollowConversationStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.unfollowConversation,
  })
