import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const assignConversationStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.assignConversation),
  assignedId: z.string(),
})

export type AssignConversationStepSchema = z.infer<
  typeof assignConversationStepSchema
>

export const assignConversationStepDefaultFn = (
  props?: Partial<AssignConversationStepSchema>,
): AssignConversationStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.assignConversation,
  assignedId: "",
  ...props,
})
