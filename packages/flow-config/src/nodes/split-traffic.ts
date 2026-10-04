import { z } from "zod"
import {
  splitTrafficStepDefaultFn,
  splitTrafficStepSchema,
} from "../steps/split-traffic"
import {
  baseNodeDataSchema,
  baseNodeSchema,
  type DefaultNodeProps,
  defaultNodeData,
  nodeTypeSchema,
} from "./base"

export const splitTrafficNodeSchema = baseNodeSchema.extend({
  type: z
    .literal(nodeTypeSchema.enum.splitTraffic)
    .describe(
      'Node type "splitTraffic". `data.details.steps` holds splitTraffic steps whose `cases[].value` percentages sum to 100; each branch is an edge with `sourceHandle` `<nodeId>-case-<index>` (the id of this node, index = 0-based position in `cases`).',
    ),
  data: baseNodeDataSchema.extend({
    details: z.object({
      steps: z.array(splitTrafficStepSchema).min(1),
    }),
  }),
})

export type SplitTrafficNodeSchema = z.input<typeof splitTrafficNodeSchema>

export const splitTrafficNodeDefaultFn = (
  props: DefaultNodeProps,
): SplitTrafficNodeSchema => ({
  ...defaultNodeData(),
  type: nodeTypeSchema.enum.splitTraffic,
  ...props.nodeProps,
  data: {
    name: "Split Traffic",
    isStartNode: false,
    ...props.dataProps,
    details: {
      steps: [splitTrafficStepDefaultFn()],
      ...props.detailProps,
    },
  },
})
