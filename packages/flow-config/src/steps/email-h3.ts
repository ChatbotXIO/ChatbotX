import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const emailH3StepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.emailH3),
  text: z.string().trim().min(1).max(1000),
})

export type EmailH3StepSchema = z.infer<typeof emailH3StepSchema>

export const emailH3StepDefaultFn = (
  props: Partial<EmailH3StepSchema> = {},
): EmailH3StepSchema => ({
  text: "",
  ...props,
  id: createId(),
  stepType: stepTypes.enum.emailH3,
})
