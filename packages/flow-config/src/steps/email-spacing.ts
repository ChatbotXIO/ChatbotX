import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const emailSpacingStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.emailSpacing),
})

export type EmailSpacingStepSchema = z.infer<typeof emailSpacingStepSchema>

export const emailSpacingStepDefaultFn = (
  props: Partial<EmailSpacingStepSchema> = {},
): EmailSpacingStepSchema => ({
  ...props,
  id: createId(),
  stepType: StepType.emailSpacing,
})
