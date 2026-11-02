import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const startExternalNodeStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.startExternalNode)
    .describe('Step type discriminator: "startExternalNode".'),
  flowId: zodBigintAsString(),
  nodeId: zodBigintAsString(),
})

export type StartExternalNodeStepSchema = z.infer<
  typeof startExternalNodeStepSchema
>

export const startExternalNodeStepDefaultFn = (
  props?: Partial<StartExternalNodeStepSchema>,
): StartExternalNodeStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.startExternalNode,
  flowId: "",
  nodeId: "",
  ...props,
})

/**
 * The stored shape of the trigger action "Start External Step": the same
 * flow + node pair as the `startExternalNode` flow step, without the step
 * envelope.
 */
export const startExternalStepActionSchema = startExternalNodeStepSchema
  .pick({ flowId: true, nodeId: true })
  .extend({ type: z.literal("startExternalStep") })
export type StartExternalStepActionSchema = z.infer<
  typeof startExternalStepActionSchema
>
