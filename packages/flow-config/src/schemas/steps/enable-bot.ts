import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const enableBotStepSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(StepType.ENABLE_BOT),
})

export type EnableBotStepSchema = z.infer<typeof enableBotStepSchema>

export const enableBotStepDefaultFn = (): EnableBotStepSchema => ({
  id: createId(),
  actionType: StepType.ENABLE_BOT,
})
