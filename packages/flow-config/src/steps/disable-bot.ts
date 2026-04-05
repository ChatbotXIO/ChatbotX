import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const disableBotStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.disableBot),
})

export type DisableBotStepSchema = z.infer<typeof disableBotStepSchema>

export const disableBotStepDefaultFn = (): DisableBotStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.disableBot,
})
