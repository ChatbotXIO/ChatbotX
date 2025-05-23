import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const optInEmailStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.OptInEmail),
})

export type OptInEmailStepSchema = z.infer<typeof optInEmailStepSchema>

export const optInEmailStepDefaultFn = (): OptInEmailStepSchema => ({
  id: createId(),
  stepType: StepType.OptInEmail,
})
