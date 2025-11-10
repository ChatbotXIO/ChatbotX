import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const markEmailVerifiedStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.markEmailVerified),
})

export type MarkEmailVerifiedStepSchema = z.infer<
  typeof markEmailVerifiedStepSchema
>

export const markEmailVerifiedStepDefaultFn =
  (): MarkEmailVerifiedStepSchema => ({
    id: createId(),
    stepType: StepType.markEmailVerified,
  })
