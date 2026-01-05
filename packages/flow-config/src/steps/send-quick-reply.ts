import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { buttonStepSchema } from "./button"
import { StepType } from "./step-action"

export const sendQuickReplyStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.sendQuickReply),
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
  stepType: StepType.sendQuickReply,
})
