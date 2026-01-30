import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const emailHeaderStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.emailHeader),
  topicId: z.string().trim(),
  from: z.string().trim(),
  to: z.string().trim(),
  subject: z.string().trim(),
  preheader: z.string().trim(),
})

export type EmailHeaderStepSchema = z.infer<typeof emailHeaderStepSchema>

export const emailHeaderStepDefaultFn = (
  props: Partial<EmailHeaderStepSchema> = {},
): EmailHeaderStepSchema => ({
  topicId: "",
  from: "{{email}}",
  to: "",
  subject: "",
  preheader: "",
  ...props,
  id: createId(),
  stepType: StepType.emailHeader,
})
