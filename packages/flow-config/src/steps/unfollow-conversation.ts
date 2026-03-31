import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const unfollowConversationStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.unfollowConversation),
})

export type UnfollowConversationStepSchema = z.infer<
  typeof unfollowConversationStepSchema
>

export const unfollowConversationStepDefaultFn =
  (): UnfollowConversationStepSchema => ({
    id: createId(),
    stepType: StepType.unfollowConversation,
  })
