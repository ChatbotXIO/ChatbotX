import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const startExternalFlowStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.startExternalFlow)
    .describe('Step type discriminator: "startExternalFlow".'),
  flowId: zodBigintAsString(),
})

export type StartExternalFlowStepSchema = z.infer<
  typeof startExternalFlowStepSchema
>

export const startExternalFlowStepDefaultFn = (
  props?: Partial<StartExternalFlowStepSchema>,
): StartExternalFlowStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.startExternalFlow,
  flowId: "",
  ...props,
})
