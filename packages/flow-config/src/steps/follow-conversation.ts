import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const followConversationStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.followConversation),
})

export type FollowConversationStepSchema = z.infer<
  typeof followConversationStepSchema
>

export const followConversationStepDefaultFn =
  (): FollowConversationStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.followConversation,
  })
