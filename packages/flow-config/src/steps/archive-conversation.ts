import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const archiveConversationStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.archiveConversation)
    .describe('Step type discriminator: "archiveConversation".'),
})

export type ArchiveConversationStepSchema = z.infer<
  typeof archiveConversationStepSchema
>

export const archiveConversationStepDefaultFn = (
  props?: Partial<ArchiveConversationStepSchema>,
): ArchiveConversationStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.archiveConversation,
  ...props,
})
