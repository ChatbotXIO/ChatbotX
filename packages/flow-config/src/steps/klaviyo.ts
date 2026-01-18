import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const klaviyoStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.klaviyo),
  listId: z.string().optional(),
  emailField: z.string().min(1),
  phoneField: z.string().optional(),
  titleField: z.string().optional(),
  orgField: z.string().optional(),
  successNodeId: z.string().optional(),
  errorNodeId: z.string().optional(),
})

export type KlaviyoStepSchema = z.infer<typeof klaviyoStepSchema>

export const klaviyoDefaultFn = (): KlaviyoStepSchema => ({
  id: createId(),
  stepType: StepType.klaviyo,
  listId: "",
  emailField: "email",
  phoneField: "",
  titleField: "",
  orgField: "",
})
