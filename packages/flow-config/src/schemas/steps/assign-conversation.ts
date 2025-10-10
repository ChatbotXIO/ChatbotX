import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const assignConversationStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.ASSIGN_CONVERSATION),
  assignedId: z.cuid2(),
})

export type AssignConversationStepSchema = z.infer<
  typeof assignConversationStepSchema
>

export const assignConversationStepDefaultFn =
  (): AssignConversationStepSchema => ({
    id: createId(),
    stepType: StepType.ASSIGN_CONVERSATION,
    assignedId: "",
  })
