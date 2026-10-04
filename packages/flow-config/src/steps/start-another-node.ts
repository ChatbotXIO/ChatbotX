import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const startAnotherNodeStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.startAnotherNode)
    .describe('Step type discriminator: "startAnotherNode".'),
  nodeId: zodBigintAsString(),
  viewOnly: z.boolean().optional(),
})

export type StartAnotherNodeStepSchema = z.infer<
  typeof startAnotherNodeStepSchema
>

export const startAnotherNodeStepDefaultFn = (
  props?: Partial<StartAnotherNodeStepSchema>,
): StartAnotherNodeStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.startAnotherNode,
  nodeId: "",
  ...props,
})
