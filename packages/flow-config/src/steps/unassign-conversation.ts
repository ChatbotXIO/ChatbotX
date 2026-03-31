import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const unassignConversationStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.unassignConversation),
})
export type UnassignConversationStepSchema = z.infer<
  typeof unassignConversationStepSchema
>

export const unassignConversationStepDefaultFn =
  (): UnassignConversationStepSchema => ({
    id: createId(),
    stepType: StepType.unassignConversation,
  })
