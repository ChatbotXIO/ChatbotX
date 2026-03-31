import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const unsubscribeSequenceStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.unsubscribeSequence),
  sequenceId: z.string().optional(),
})

export type UnsubscribeSequenceStepSchema = z.infer<
  typeof unsubscribeSequenceStepSchema
>

export const unsubscribeSequenceStepDefaultFn =
  (): UnsubscribeSequenceStepSchema => ({
    id: createId(),
    stepType: StepType.unsubscribeSequence,
    sequenceId: undefined,
  })
