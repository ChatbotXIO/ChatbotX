import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const startExternalNodeStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.startExternalNode),
  flowId: z.bigint(),
  nodeId: z.bigint(),
})

export type StartExternalNodeStepSchema = z.infer<
  typeof startExternalNodeStepSchema
>

export const startExternalNodeStepDefaultFn = (
  props?: Partial<StartExternalNodeStepSchema>,
): StartExternalNodeStepSchema => ({
  id: createId(),
  stepType: StepType.startExternalNode,
  flowId: "",
  nodeId: "",
  ...props,
})
