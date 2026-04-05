import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const unsubscribeBroadcastStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.unsubscribeBroadcast),
})

export type UnsubscribeBroadcastStepSchema = z.infer<
  typeof unsubscribeBroadcastStepSchema
>

export const unsubscribeBroadcastStepDefaultFn =
  (): UnsubscribeBroadcastStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.unsubscribeBroadcast,
  })
