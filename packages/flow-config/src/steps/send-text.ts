import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"

export const sendTextStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.sendText),
  text: z.string().trim().min(1).max(1000),
  buttons: z.array(buttonStepSchema),
})

export type SendTextStepSchema = z.infer<typeof sendTextStepSchema>

export const sendTextStepDefaultFn = (
  props: Partial<SendTextStepSchema> = {},
): SendTextStepSchema => ({
  text: "",
  buttons: [],
  ...props,
  id: createId(),
  stepType: stepTypes.enum.sendText,
})
