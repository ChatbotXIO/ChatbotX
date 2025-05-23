import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const assignConversationStepSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(StepType.ASSIGN_CONVERSATION),
  recipientId: z.string().cuid2(),
  recipientName: z.string().nullable(),
})

export type AssignConversationStepSchema = z.infer<
  typeof assignConversationStepSchema
>

export const assignConversationStepDefaultFn =
  (): AssignConversationStepSchema => ({
    id: createId(),
    actionType: StepType.ASSIGN_CONVERSATION,
    recipientId: "",
    recipientName: "",
  })
