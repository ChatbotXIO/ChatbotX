import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const mailerLiteStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.mailerLite),
  groupId: z.string().optional(),
  emailField: z.string().min(1),
  autoresponders: z.boolean(),
  type: z.enum(["active", "unconfirmed"]),
  mergeFields: z
    .array(
      z.object({
        chatbotField: z.string(),
        mailerLiteField: z.string().min(1),
      }),
    )
    .optional(),
  successNodeId: z.string().optional(),
  errorNodeId: z.string().optional(),
})

export type MailerLiteStepSchema = z.infer<typeof mailerLiteStepSchema>

export const mailerLiteDefaultFn = (): MailerLiteStepSchema => ({
  id: createId(),
  stepType: StepType.mailerLite,
  groupId: "",
  emailField: "email",
  autoresponders: false,
  type: "active",
  mergeFields: [],
})
