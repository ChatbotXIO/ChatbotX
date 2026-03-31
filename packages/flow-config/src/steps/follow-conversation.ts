import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const followConversationStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.followConversation),
})

export type FollowConversationStepSchema = z.infer<
  typeof followConversationStepSchema
>

export const followConversationStepDefaultFn =
  (): FollowConversationStepSchema => ({
    id: createId(),
    stepType: StepType.followConversation,
  })
