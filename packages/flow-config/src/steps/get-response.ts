import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const getResponseStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.getResponse),
  campaignId: z.string().min(1),
  dayOfCycle: z.string().optional(),
  tags: z.array(z.string()).optional(),
  emailField: z.string().min(1),
  successNodeId: z.string().optional(),
  errorNodeId: z.string().optional(),
})

export type GetResponseStepSchema = z.infer<typeof getResponseStepSchema>

export const getResponseDefaultFn = (): GetResponseStepSchema => ({
  id: createId(),
  stepType: StepType.getResponse,
  campaignId: "",
  tags: [],
  emailField: "email",
})
