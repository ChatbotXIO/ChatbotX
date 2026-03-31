import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const unsubscribeBroadcastStepSchema = z.object({
  id: z.bigint(),
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
