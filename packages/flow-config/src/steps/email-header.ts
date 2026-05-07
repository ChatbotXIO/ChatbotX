import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const emailHeaderStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.emailHeader),
  integrationSmtpId: z.string().trim(),
  topicId: z.string().trim().optional(),
  from: z.string().trim(),
  to: z.string().trim(),
  subject: z.string().trim(),
  preheader: z.string().trim(),
})

export type EmailHeaderStepSchema = z.infer<typeof emailHeaderStepSchema>

export const emailHeaderStepDefaultFn = (
  props: Partial<EmailHeaderStepSchema> = {},
): EmailHeaderStepSchema => ({
  integrationSmtpId: "",
  topicId: "",
  from: "{{email}}",
  to: "",
  subject: "",
  preheader: "",
  ...props,
  id: createId(),
  stepType: stepTypes.enum.emailHeader,
})
