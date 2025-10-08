import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const unarchiveConversationStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.UNARCHIVE_CONVERSATION),
})

export type UnarchiveConversationStepSchema = z.infer<
  typeof unarchiveConversationStepSchema
>

export const unarchiveConversationStepDefaultFn =
  (): UnarchiveConversationStepSchema => ({
    id: createId(),
    stepType: StepType.UNARCHIVE_CONVERSATION,
  })
