import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const followConversationStepSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(StepType.FOLLOW_CONVERSATION),
})

export type FollowConversationStepSchema = z.infer<
  typeof followConversationStepSchema
>

export const followConversationStepDefaultFn =
  (): FollowConversationStepSchema => ({
    id: createId(),
    actionType: StepType.FOLLOW_CONVERSATION,
  })
