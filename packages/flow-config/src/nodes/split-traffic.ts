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
  NodeType,
} from "./base"

export const splitTrafficNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.splitTraffic),
  data: baseNodeDataSchema.extend({
    details: z.object({
      beforeStep: splitTrafficStepSchema,
    }),
  }),
})

export type SplitTrafficNodeSchema = z.input<typeof splitTrafficNodeSchema>

export const splitTrafficNodeDefaultFn = (
  props: DefaultNodeProps,
): SplitTrafficNodeSchema => ({
  ...defaultNodeData(),
  type: NodeType.splitTraffic,
  ...props.nodeProps,
  data: {
    name: "Split Traffic",
    isStartNode: false,
    ...props.dataProps,
    details: {
      beforeStep: splitTrafficStepDefaultFn(),
      ...props.detailProps,
    },
  },
})
