import { z } from "zod"
import {
  startExternalFlowStepDefaultFn,
  startExternalFlowStepSchema,
} from "../steps/start-external-flow"
import {
  baseNodeDataSchema,
  baseNodeSchema,
  type DefaultNodeProps,
  defaultNodeData,
  nodeTypeSchema,
} from "./base"

export const startFlowNodeSchema = baseNodeSchema.extend({
  type: z.literal(nodeTypeSchema.enum.startFlow),
  data: baseNodeDataSchema.extend({
    details: z.object({
      beforeStep: startExternalFlowStepSchema,
    }),
  }),
})
export type StartFlowNodeSchema = z.infer<typeof startFlowNodeSchema>

export const startFlowNodeDefaultFn = (
  props: DefaultNodeProps,
): StartFlowNodeSchema => ({
  ...defaultNodeData(),
  type: nodeTypeSchema.enum.startFlow,
  ...props.nodeProps,
  data: {
    name: "Start Flow",
    isStartNode: false,
    ...props.dataProps,
    details: {
      beforeStep: startExternalFlowStepDefaultFn(),
      ...props.detailProps,
    },
  },
})
