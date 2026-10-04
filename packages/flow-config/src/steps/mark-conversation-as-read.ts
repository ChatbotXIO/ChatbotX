import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const markConversationAsReadStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.markConversationAsRead)
    .describe('Step type discriminator: "markConversationAsRead".'),
})
export type MarkConversationAsReadStepSchema = z.infer<
  typeof markConversationAsReadStepSchema
>

export const markConversationAsReadStepDefaultFn =
  (): MarkConversationAsReadStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.markConversationAsRead,
  })
