import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const emailTextStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.emailText),
  text: z.string().trim().min(1).max(1000),
})

export type EmailTextStepSchema = z.infer<typeof emailTextStepSchema>

export const emailTextStepDefaultFn = (
  props: Partial<EmailTextStepSchema> = {},
): EmailTextStepSchema => ({
  text: "",
  ...props,
  id: createId(),
  stepType: stepTypes.enum.emailText,
})
