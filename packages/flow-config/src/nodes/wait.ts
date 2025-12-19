import { z } from "zod"
import { waitStepDefaultFn, waitStepSchema } from "../steps/wait"
import {
  baseNodeDataSchema,
  baseNodeSchema,
  type DefaultNodeProps,
  defaultNodeData,
  NodeType,
} from "./base"

export const waitNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.wait),
  data: baseNodeDataSchema.extend({
    details: z.object({
      beforeStep: waitStepSchema,
    }),
  }),
})
export type WaitNodeSchema = z.input<typeof waitNodeSchema>

export const waitNodeDefaultFn = (props: DefaultNodeProps): WaitNodeSchema => ({
  ...defaultNodeData(),
  type: NodeType.wait,
  ...props.nodeProps,
  data: {
    name: "Wait",
    isStartNode: false,
    ...props.dataProps,
    details: {
      beforeStep: waitStepDefaultFn(),
      ...props.detailProps,
    },
  },
})
