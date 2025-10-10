import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const archiveConversationStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.ARCHIVE_CONVERSATION),
})

export type ArchiveConversationStepSchema = z.infer<
  typeof archiveConversationStepSchema
>

export const archiveConversationStepDefaultFn =
  (): ArchiveConversationStepSchema => ({
    id: createId(),
    stepType: StepType.ARCHIVE_CONVERSATION,
  })
