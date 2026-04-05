import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const emailLineStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.emailLine),
})

export type EmailLineStepSchema = z.infer<typeof emailLineStepSchema>

export const emailLineStepDefaultFn = (
  props: Partial<EmailLineStepSchema> = {},
): EmailLineStepSchema => ({
  ...props,
  id: createId(),
  stepType: stepTypes.enum.emailLine,
})
