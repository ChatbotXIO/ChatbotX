import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const unsubscribeSequenceStepSchema = z.object({
  id: z.cuid2(),
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
