import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const assignConversationStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.assignConversation),
  assignedId: z.string(),
})

export type AssignConversationStepSchema = z.infer<
  typeof assignConversationStepSchema
>

export const assignConversationStepDefaultFn = (
  props?: Partial<AssignConversationStepSchema>,
): AssignConversationStepSchema => ({
  id: createId(),
  stepType: StepType.assignConversation,
  assignedId: "",
  ...props,
})
