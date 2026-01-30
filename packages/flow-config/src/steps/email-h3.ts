import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const emailH3StepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.emailH3),
  text: z.string().trim().min(1).max(1000),
})

export type EmailH3StepSchema = z.infer<typeof emailH3StepSchema>

export const emailH3StepDefaultFn = (
  props: Partial<EmailH3StepSchema> = {},
): EmailH3StepSchema => ({
  text: "",
  ...props,
  id: createId(),
  stepType: StepType.emailH3,
})
