import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { buttonStepDefaultFn, buttonStepSchema } from "./button"
import { StepType } from "./step-action"

export const emailButtonStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.emailButton),
  beforeStep: buttonStepSchema,
})

export type EmailButtonStepSchema = z.infer<typeof emailButtonStepSchema>

export const emailButtonStepDefaultFn = (
  props: Partial<EmailButtonStepSchema> = {},
): EmailButtonStepSchema => ({
  ...props,
  id: createId(),
  stepType: StepType.emailButton,
  beforeStep: buttonStepDefaultFn(),
})
