import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const markEmailVerifiedStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.markEmailVerified)
    .describe('Step type discriminator: "markEmailVerified".'),
})

export type MarkEmailVerifiedStepSchema = z.infer<
  typeof markEmailVerifiedStepSchema
>

export const markEmailVerifiedStepDefaultFn =
  (): MarkEmailVerifiedStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.markEmailVerified,
  })
