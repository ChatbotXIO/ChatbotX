import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const disableBotStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.disableBot)
    .describe('Step type discriminator: "disableBot".'),
})

export type DisableBotStepSchema = z.infer<typeof disableBotStepSchema>

export const disableBotStepDefaultFn = (): DisableBotStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.disableBot,
})
