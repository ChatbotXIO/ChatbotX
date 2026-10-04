import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const unsubscribeSequenceStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.unsubscribeSequence)
    .describe('Step type discriminator: "unsubscribeSequence".'),
  sequenceId: z.string().optional(),
})

export type UnsubscribeSequenceStepSchema = z.infer<
  typeof unsubscribeSequenceStepSchema
>

export const unsubscribeSequenceStepDefaultFn =
  (): UnsubscribeSequenceStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.unsubscribeSequence,
    sequenceId: undefined,
  })
