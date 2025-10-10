import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const followConversationStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.FOLLOW_CONVERSATION),
})

export type FollowConversationStepSchema = z.infer<
  typeof followConversationStepSchema
>

export const followConversationStepDefaultFn =
  (): FollowConversationStepSchema => ({
    id: createId(),
    stepType: StepType.FOLLOW_CONVERSATION,
  })
