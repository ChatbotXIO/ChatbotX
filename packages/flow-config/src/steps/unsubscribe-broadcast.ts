import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const unsubscribeBroadcastStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.unsubscribeBroadcast),
})

export type UnsubscribeBroadcastStepSchema = z.infer<
  typeof unsubscribeBroadcastStepSchema
>

export const unsubscribeBroadcastStepDefaultFn =
  (): UnsubscribeBroadcastStepSchema => ({
    id: createId(),
    stepType: StepType.unsubscribeBroadcast,
  })
