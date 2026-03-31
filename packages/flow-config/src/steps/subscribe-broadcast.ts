import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const subscribeBroadcastStepSchema = z.object({
  id: z.bigint(),
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
