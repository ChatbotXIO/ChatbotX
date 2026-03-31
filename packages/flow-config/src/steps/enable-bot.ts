import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const enableBotStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.enableBot),
})

export type EnableBotStepSchema = z.infer<typeof enableBotStepSchema>

export const enableBotStepDefaultFn = (): EnableBotStepSchema => ({
  id: createId(),
  stepType: StepType.enableBot,
})
