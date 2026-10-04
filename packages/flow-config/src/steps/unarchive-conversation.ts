import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const unarchiveConversationStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.unarchiveConversation)
    .describe('Step type discriminator: "unarchiveConversation".'),
})

export type UnarchiveConversationStepSchema = z.infer<
  typeof unarchiveConversationStepSchema
>

export const unarchiveConversationStepDefaultFn =
  (): UnarchiveConversationStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.unarchiveConversation,
  })
