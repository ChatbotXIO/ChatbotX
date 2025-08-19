import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const AutoAssignConversationRule = {
  ALL_TIME: "ALL_TIME",
  LAST_HOUR: "LAST_HOUR",
  LAST_8HOURS: "LAST_8HOURS",
  LAST_24HOURS: "LAST_24HOURS",
} as const

export const autoAssignConversationStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.AUTO_ASSIGN_CONVERSATION),
  assignedIds: z.array(z.string().cuid2()),
  rule: z.nativeEnum(AutoAssignConversationRule),
})

export type AutoAssignConversationStepSchema = z.infer<
  typeof autoAssignConversationStepSchema
>

export const autoAssignConversationStepDefaultFn =
  (): AutoAssignConversationStepSchema => ({
    id: createId(),
    stepType: StepType.AUTO_ASSIGN_CONVERSATION,
    assignedIds: [],
    rule: AutoAssignConversationRule.ALL_TIME,
  })
