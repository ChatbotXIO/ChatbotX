import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const enableBotStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.ENABLE_BOT),
})

export type EnableBotStepSchema = z.infer<typeof enableBotStepSchema>

export const enableBotStepDefaultFn = (): EnableBotStepSchema => ({
  id: createId(),
  stepType: StepType.ENABLE_BOT,
})
