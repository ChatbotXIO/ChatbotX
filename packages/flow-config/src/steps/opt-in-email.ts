import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const optInEmailStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.optInEmail),
})

export type OptInEmailStepSchema = z.infer<typeof optInEmailStepSchema>

export const optInEmailStepDefaultFn = (): OptInEmailStepSchema => ({
  id: createId(),
  stepType: StepType.optInEmail,
})
