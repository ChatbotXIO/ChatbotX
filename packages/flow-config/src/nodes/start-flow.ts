import { z } from "zod"
import {
  startExternalFlowStepDefaultFn,
  startExternalFlowStepSchema,
} from "../steps/start-external-flow"
import {
  baseNodeDefaultFn,
  baseNodeSchema,
  type NodeFnProps,
  NodeType,
} from "./base"

export const startFlowNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.startFlow),
  data: z.object({
    name: z.string().trim().min(1).max(255),
    isStartNode: z.boolean(),
    beforeStep: startExternalFlowStepSchema,
    steps: z.null(),
    afterStep: z.null(),
  }),
})

export type StartFlowNodeSchema = typeof startFlowNodeSchema
export type StartFlowNodeProps = z.infer<typeof startFlowNodeSchema>

export const startFlowNodeDefaultFn = (
  props: NodeFnProps<StartFlowNodeProps>,
): StartFlowNodeProps =>
  baseNodeDefaultFn<StartFlowNodeProps>({
    ...props,
    type: NodeType.startFlow,
    beforeStep: startExternalFlowStepDefaultFn(),
  })
