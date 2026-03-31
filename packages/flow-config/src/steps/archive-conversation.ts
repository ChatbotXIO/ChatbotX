import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const archiveConversationStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.archiveConversation),
})

export type ArchiveConversationStepSchema = z.infer<
  typeof archiveConversationStepSchema
>

export const archiveConversationStepDefaultFn = (
  props?: Partial<ArchiveConversationStepSchema>,
): ArchiveConversationStepSchema => ({
  id: createId(),
  stepType: StepType.archiveConversation,
  ...props,
})
