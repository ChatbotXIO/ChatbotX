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
