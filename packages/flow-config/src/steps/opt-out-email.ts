import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const optOutEmailStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.optOutEmail)
    .describe('Step type discriminator: "optOutEmail".'),
})

export type OptOutEmailStepSchema = z.infer<typeof optOutEmailStepSchema>

export const optOutEmailStepDefaultFn = (): OptOutEmailStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.optOutEmail,
})
