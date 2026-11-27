import { triggerActions } from "@chatbotx.io/database/partials"
import { startExternalStepActionSchema } from "@chatbotx.io/flow-config"
import z from "zod"

export const startExternalStep = startExternalStepActionSchema.extend({
  type: z
    .literal(triggerActions.enum.startExternalStep)
    .describe('Action type "startExternalStep".'),
  flowId: startExternalStepActionSchema.shape.flowId.describe(
    "Id of the flow (from `flows.list`) to start for the contact.",
  ),
  nodeId: startExternalStepActionSchema.shape.nodeId.describe(
    "Id of a node in that flow's published version (from `flows.listNodes`); the flow starts at this node.",
  ),
})
export type StartExternalStep = z.infer<typeof startExternalStep>

export const defaultFn = (): StartExternalStep => ({
  type: triggerActions.enum.startExternalStep,
  flowId: "",
  nodeId: "",
})
