import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const subscribeBroadcastStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.subscribeBroadcast),
})

export type SubscribeBroadcastStepSchema = z.infer<
  typeof subscribeBroadcastStepSchema
>

export const subscribeBroadcastStepDefaultFn =
  (): SubscribeBroadcastStepSchema => ({
    id: createId(),
    stepType: StepType.subscribeBroadcast,
  })
