import { z } from "zod"
import { actionSteps } from "../shared"
import {
  baseNodeDataSchema,
  baseNodeSchema,
  type DefaultNodeProps,
  defaultNodeData,
  NodeType,
} from "./base"

export const performActionNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.performAction),
  data: baseNodeDataSchema.extend({
    details: z.object({
      steps: z.array(z.union(actionSteps)),
    }),
  }),
})
export type PerformActionNodeSchema = z.infer<typeof performActionNodeSchema>

export const performActionNodeDefaultFn = (
  props: DefaultNodeProps,
): PerformActionNodeSchema => ({
  ...defaultNodeData(),
  type: NodeType.performAction,
  ...props.nodeProps,
  data: {
    name: "Perform Action",
    isStartNode: false,
    ...props.dataProps,
    details: {
      steps: [],
      ...props.detailProps,
    },
  },
})
