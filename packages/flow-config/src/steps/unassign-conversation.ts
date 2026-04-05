import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const unassignConversationStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.unassignConversation),
})
export type UnassignConversationStepSchema = z.infer<
  typeof unassignConversationStepSchema
>

export const unassignConversationStepDefaultFn =
  (): UnassignConversationStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.unassignConversation,
  })
