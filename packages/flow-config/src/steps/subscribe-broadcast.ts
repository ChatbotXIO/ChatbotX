import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const subscribeBroadcastStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.subscribeBroadcast)
    .describe('Step type discriminator: "subscribeBroadcast".'),
})

export type SubscribeBroadcastStepSchema = z.infer<
  typeof subscribeBroadcastStepSchema
>

export const subscribeBroadcastStepDefaultFn =
  (): SubscribeBroadcastStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.subscribeBroadcast,
  })
