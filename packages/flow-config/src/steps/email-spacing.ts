import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const emailSpacingStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.emailSpacing),
})

export type EmailSpacingStepSchema = z.infer<typeof emailSpacingStepSchema>

export const emailSpacingStepDefaultFn = (
  props: Partial<EmailSpacingStepSchema> = {},
): EmailSpacingStepSchema => ({
  ...props,
  id: createId(),
  stepType: stepTypes.enum.emailSpacing,
})
