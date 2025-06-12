import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const disableBotStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.DISABLE_BOT),
  notifyAdmin: z.boolean(),
})

export type DisableBotStepSchema = z.infer<typeof disableBotStepSchema>

export const disableBotStepDefaultFn = (): DisableBotStepSchema => ({
  id: createId(),
  stepType: StepType.DISABLE_BOT,
  notifyAdmin: true,
})
