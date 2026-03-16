import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const subscribeSequenceStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.subscribeSequence),
  sequenceId: z.string().optional(),
})

export type SubscribeSequenceStepSchema = z.infer<
  typeof subscribeSequenceStepSchema
>

export const subscribeSequenceStepDefaultFn =
  (): SubscribeSequenceStepSchema => ({
    id: createId(),
    stepType: StepType.subscribeSequence,
    sequenceId: undefined,
  })
