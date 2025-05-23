import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const archiveConversationStepSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(StepType.ARCHIVE_CONVERSATION),
})

export type ArchiveConversationStepSchema = z.infer<
  typeof archiveConversationStepSchema
>

export const archiveConversationStepDefaultFn =
  (): ArchiveConversationStepSchema => ({
    id: createId(),
    actionType: StepType.ARCHIVE_CONVERSATION,
  })
