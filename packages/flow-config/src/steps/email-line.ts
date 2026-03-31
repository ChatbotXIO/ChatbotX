import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const emailLineStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.emailLine),
})

export type EmailLineStepSchema = z.infer<typeof emailLineStepSchema>

export const emailLineStepDefaultFn = (
  props: Partial<EmailLineStepSchema> = {},
): EmailLineStepSchema => ({
  ...props,
  id: createId(),
  stepType: StepType.emailLine,
})
