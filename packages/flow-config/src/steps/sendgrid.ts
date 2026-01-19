import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const sendGridStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.sendgrid),
  listId: z.string().optional(),
  emailField: z.string().min(1),
  phoneField: z.string().optional(),
  mergeFields: z
    .array(
      z.object({
        chatbotField: z.string(),
        sendGridField: z.string().min(1),
      }),
    )
    .optional(),
  successNodeId: z.string().optional(),
  errorNodeId: z.string().optional(),
})

export type SendGridStepSchema = z.infer<typeof sendGridStepSchema>

export const sendGridDefaultFn = (): SendGridStepSchema => ({
  id: createId(),
  stepType: StepType.sendgrid,
  listId: "",
  emailField: "email",
  phoneField: "",
  mergeFields: [],
})
