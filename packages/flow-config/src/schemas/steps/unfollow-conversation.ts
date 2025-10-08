import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const unfollowConversationStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.UNFOLLOW_CONVERSATION),
})

export type UnfollowConversationStepSchema = z.infer<
  typeof unfollowConversationStepSchema
>

export const unfollowConversationStepDefaultFn =
  (): UnfollowConversationStepSchema => ({
    id: createId(),
    stepType: StepType.UNFOLLOW_CONVERSATION,
  })
