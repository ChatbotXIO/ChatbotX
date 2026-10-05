import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const markConversationAsUnreadStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.markConversationAsUnread)
    .describe('Step type discriminator: "markConversationAsUnread".'),
})
export type MarkConversationAsUnreadStepSchema = z.infer<
  typeof markConversationAsUnreadStepSchema
>

export const markConversationAsUnreadStepDefaultFn =
  (): MarkConversationAsUnreadStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.markConversationAsUnread,
  })
