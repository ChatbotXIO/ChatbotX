import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const autoAssignConversationStepSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(StepType.AUTO_ASSIGN_CONVERSATION),
  // recipients: z.array(z.string().cuid2()).min(1),
})

export type AutoAssignConversationStepSchema = z.infer<
  typeof autoAssignConversationStepSchema
>

export const autoAssignConversationStepDefaultFn =
  (): AutoAssignConversationStepSchema => ({
    id: createId(),
    actionType: StepType.AUTO_ASSIGN_CONVERSATION,
    // recipients: [],
  })
