import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"

export const sendTextStepSchema = z.object({
  id: zodBigintAsString(),
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
