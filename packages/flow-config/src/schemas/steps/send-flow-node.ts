import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const sendFlowNodeStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.SEND_FLOW_NODE),
  nodeId: z.cuid2(),
})

export type SendFlowNodeStepSchema = z.infer<typeof sendFlowNodeStepSchema>

export const sendFlowNodeStepDefaultFn = (
  nodeId = "",
): SendFlowNodeStepSchema => ({
  id: createId(),
  stepType: StepType.SEND_FLOW_NODE,
  nodeId,
})
