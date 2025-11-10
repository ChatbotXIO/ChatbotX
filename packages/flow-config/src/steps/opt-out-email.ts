import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const optOutEmailStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.optOutEmail),
})

export type OptOutEmailStepSchema = z.infer<typeof optOutEmailStepSchema>

export const optOutEmailStepDefaultFn = (): OptOutEmailStepSchema => ({
  id: createId(),
  stepType: StepType.optOutEmail,
})
