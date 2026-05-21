import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const AutoAssignConversationRule = {
  ALL_TIME: "ALL_TIME",
  LAST_HOUR: "LAST_HOUR",
  LAST_8HOURS: "LAST_8HOURS",
  LAST_24HOURS: "LAST_24HOURS",
} as const

export const autoAssignConversationStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.autoAssignConversation),
  assignedIds: z.array(z.string()),
  rule: z.enum(AutoAssignConversationRule),
  states: z.tuple([successStateSchema, errorStateSchema]),
})

export type AutoAssignConversationStepSchema = z.infer<
  typeof autoAssignConversationStepSchema
>

export const autoAssignConversationStepDefaultFn = (
  props?: Partial<AutoAssignConversationStepSchema>,
): AutoAssignConversationStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.autoAssignConversation,
  assignedIds: [],
  rule: AutoAssignConversationRule.ALL_TIME,
  states: [successStateDefaultFn(), errorStateDefaultFn()],
  ...props,
})
