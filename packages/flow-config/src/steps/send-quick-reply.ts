import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"

export const sendQuickReplyStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.sendQuickReply),
  message: z.string().trim().min(1).max(1000),
  buttons: z.array(buttonStepSchema),
})

export type SendQuickReplyStepSchema = z.infer<typeof sendQuickReplyStepSchema>

export const sendQuickReplyStepDefaultFn = (
  props: Partial<SendQuickReplyStepSchema> = {},
): SendQuickReplyStepSchema => ({
  message: "Please select an option",
  buttons: [],
  ...props,
  id: createId(),
  stepType: stepTypes.enum.sendQuickReply,
})
