import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const subscribeSequenceStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.subscribeSequence),
  sequenceId: z.string().optional(),
})

export type SubscribeSequenceStepSchema = z.infer<
  typeof subscribeSequenceStepSchema
>

export const subscribeSequenceStepDefaultFn =
  (): SubscribeSequenceStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.subscribeSequence,
    sequenceId: undefined,
  })
