import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const emailTextStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.emailText),
  text: z.string().trim().min(1).max(1000),
})

export type EmailTextStepSchema = z.infer<typeof emailTextStepSchema>

export const emailTextStepDefaultFn = (
  props: Partial<EmailTextStepSchema> = {},
): EmailTextStepSchema => ({
  text: "",
  ...props,
  id: createId(),
  stepType: StepType.emailText,
})
