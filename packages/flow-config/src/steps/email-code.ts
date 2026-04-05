import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const emailCodeStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.emailCode),
  text: z.string().trim().min(1).max(1000),
})

export type EmailCodeStepSchema = z.infer<typeof emailCodeStepSchema>

export const emailCodeStepDefaultFn = (
  props: Partial<EmailCodeStepSchema> = {},
): EmailCodeStepSchema => ({
  text: "",
  ...props,
  id: createId(),
  stepType: stepTypes.enum.emailCode,
})
