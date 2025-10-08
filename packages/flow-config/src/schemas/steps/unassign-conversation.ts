import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const unassignConversationStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.UNASSIGN_CONVERSATION),
})
export type UnassignConversationStepSchema = z.infer<
  typeof unassignConversationStepSchema
>

export const unassignConversationStepDefaultFn =
  (): UnassignConversationStepSchema => ({
    id: createId(),
    stepType: StepType.UNASSIGN_CONVERSATION,
  })
