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
  id: z.cuid2(),
  stepType: z.literal(StepType.autoAssignConversation),
  assignedIds: z.array(z.string()),
  rule: z.enum(AutoAssignConversationRule),
})

export type AutoAssignConversationStepSchema = z.infer<
  typeof autoAssignConversationStepSchema
>

export const autoAssignConversationStepDefaultFn = (
  props?: Partial<AutoAssignConversationStepSchema>,
): AutoAssignConversationStepSchema => ({
  id: createId(),
  stepType: StepType.autoAssignConversation,
  assignedIds: [],
  rule: AutoAssignConversationRule.ALL_TIME,
  ...props,
})
