import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const optInEmailStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.optInEmail)
    .describe('Step type discriminator: "optInEmail".'),
})

export type OptInEmailStepSchema = z.infer<typeof optInEmailStepSchema>

export const optInEmailStepDefaultFn = (): OptInEmailStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.optInEmail,
})
