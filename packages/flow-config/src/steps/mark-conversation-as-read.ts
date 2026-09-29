import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const markConversationAsReadStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.markConversationAsRead),
})
export type MarkConversationAsReadStepSchema = z.infer<
  typeof markConversationAsReadStepSchema
>

export const markConversationAsReadStepDefaultFn =
  (): MarkConversationAsReadStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.markConversationAsRead,
  })
