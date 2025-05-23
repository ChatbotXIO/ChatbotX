import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const optOutEmailStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.OptOutEmail),
})

export type OptOutEmailStepSchema = z.infer<typeof optOutEmailStepSchema>

export const optOutEmailStepDefaultFn = (): OptOutEmailStepSchema => ({
  id: createId(),
  stepType: StepType.OptOutEmail,
})
