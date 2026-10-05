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
  type: z
    .literal(nodeTypeSchema.enum.wait)
    .describe(
      'Node type "wait": pauses the flow. `data.details.steps` holds exactly one wait step.',
    ),
  data: baseNodeDataSchema.extend({
    details: z.object({
      steps: z.array(waitStepSchema).min(1).max(1),
    }),
  }),
})
export type WaitNodeSchema = z.infer<typeof waitNodeSchema>

export const waitNodeDefaultFn = (props: DefaultNodeProps): WaitNodeSchema => ({
  ...defaultNodeData(),
  type: nodeTypeSchema.enum.wait,
  ...props.nodeProps,
  data: {
    name: "Wait",
    isStartNode: false,
    ...props.dataProps,
    details: {
      steps: [waitStepDefaultFn()],
      ...props.detailProps,
    },
  },
})
