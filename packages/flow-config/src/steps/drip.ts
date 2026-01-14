import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const dripStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.drip),
  accountId: z.string().min(1),
  emailField: z.string().min(1),
  phoneField: z.string().optional(),
  tags: z.array(z.string()).optional(),
  mergeFields: z
    .array(
      z.object({
        chatbotField: z.string(),
        dripField: z.string().min(1),
      }),
    )
    .optional(),
  successNodeId: z.string().optional(),
  errorNodeId: z.string().optional(),
})

export type DripStepSchema = z.infer<typeof dripStepSchema>

export const dripDefaultFn = (): DripStepSchema => ({
  id: createId(),
  stepType: StepType.drip,
  accountId: "",
  emailField: "email",
  phoneField: "",
  tags: [],
  mergeFields: [],
})
