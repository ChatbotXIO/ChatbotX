import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const emailSpacingStepSchema = z.object({
  id: z.cuid2(),
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
