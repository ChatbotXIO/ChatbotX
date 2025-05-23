import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const unassignConversationStepSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(StepType.UNASSIGN_CONVERSATION),
})
export type UnassignConversationStepSchema = z.infer<
  typeof unassignConversationStepSchema
>

export const unassignConversationStepDefaultFn =
  (): UnassignConversationStepSchema => ({
    id: createId(),
    actionType: StepType.UNASSIGN_CONVERSATION,
  })
