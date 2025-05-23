import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const unarchiveConversationStepSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(StepType.UNARCHIVE_CONVERSATION),
})

export type UnarchiveConversationStepSchema = z.infer<
  typeof unarchiveConversationStepSchema
>

export const unarchiveConversationStepDefaultFn =
  (): UnarchiveConversationStepSchema => ({
    id: createId(),
    actionType: StepType.UNARCHIVE_CONVERSATION,
  })
