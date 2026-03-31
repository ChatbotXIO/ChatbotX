import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const markEmailVerifiedStepSchema = z.object({
  id: z.bigint(),
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
