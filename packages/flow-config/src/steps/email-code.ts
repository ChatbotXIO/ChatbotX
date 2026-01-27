import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const emailCodeStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.emailCode),
  text: z.string().trim().min(1).max(1000),
})

export type EmailCodeStepSchema = z.infer<typeof emailCodeStepSchema>

export const emailCodeStepDefaultFn = (
  props: Partial<EmailCodeStepSchema> = {},
): EmailCodeStepSchema => ({
  text: "",
  ...props,
  id: createId(),
  stepType: StepType.emailCode,
})
