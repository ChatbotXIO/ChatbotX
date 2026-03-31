import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const assignConversationStepSchema = z.object({
  id: z.bigint(),
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
