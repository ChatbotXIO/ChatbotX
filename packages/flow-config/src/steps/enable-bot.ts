import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const enableBotStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.enableBot),
})

export type EnableBotStepSchema = z.infer<typeof enableBotStepSchema>

export const enableBotStepDefaultFn = (): EnableBotStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.enableBot,
})
