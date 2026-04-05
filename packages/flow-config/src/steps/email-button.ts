import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { buttonStepDefaultFn, buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"

export const emailButtonStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.emailButton),
  beforeStep: buttonStepSchema,
})

export type EmailButtonStepSchema = z.infer<typeof emailButtonStepSchema>

export const emailButtonStepDefaultFn = (
  props: Partial<EmailButtonStepSchema> = {},
): EmailButtonStepSchema => ({
  ...props,
  id: createId(),
  stepType: stepTypes.enum.emailButton,
  beforeStep: buttonStepDefaultFn(),
})
