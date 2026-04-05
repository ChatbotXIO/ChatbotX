import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"

export const sendQuickReplyStepSchema = z.object({
  id: zodBigintAsString(),
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
