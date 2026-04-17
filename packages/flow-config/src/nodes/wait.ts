import { z } from "zod"
import { waitStepDefaultFn, waitStepSchema } from "../steps/wait"
import {
  baseNodeDataSchema,
  baseNodeSchema,
  type DefaultNodeProps,
  defaultNodeData,
  nodeTypeSchema,
} from "./base"

export const waitNodeSchema = baseNodeSchema.extend({
  type: z.literal(nodeTypeSchema.enum.wait),
  data: baseNodeDataSchema.extend({
    details: z.object({
      beforeStep: waitStepSchema,
    }),
  }),
})
export type WaitNodeSchema = z.input<typeof waitNodeSchema>

export const waitNodeDefaultFn = (props: DefaultNodeProps): WaitNodeSchema => ({
  ...defaultNodeData(),
  type: nodeTypeSchema.enum.wait,
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
