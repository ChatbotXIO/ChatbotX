import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const archiveConversationStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.archiveConversation),
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
