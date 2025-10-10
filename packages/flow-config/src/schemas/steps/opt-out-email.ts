import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const optOutEmailStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.OPT_OUT_EMAIL),
})

export type OptOutEmailStepSchema = z.infer<typeof optOutEmailStepSchema>

export const optOutEmailStepDefaultFn = (): OptOutEmailStepSchema => ({
  id: createId(),
  stepType: StepType.OPT_OUT_EMAIL,
})
