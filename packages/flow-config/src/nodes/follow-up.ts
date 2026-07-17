import { z } from "zod"
import { followUpStepDefaultFn, followUpStepSchema } from "../steps/follow-up"
import {
  baseNodeDataSchema,
  baseNodeSchema,
  type DefaultNodeProps,
  defaultNodeData,
  nodeTypeSchema,
} from "./base"

export const followUpNodeSchema = baseNodeSchema.extend({
  type: z.literal(nodeTypeSchema.enum.followUp),
  data: baseNodeDataSchema.extend({
    details: z.object({
      steps: z.array(followUpStepSchema).min(1).max(1),
    }),
  }),
})
export type FollowUpNodeSchema = z.infer<typeof followUpNodeSchema>

export const followUpNodeDefaultFn = (
  props: DefaultNodeProps,
): FollowUpNodeSchema => ({
  ...defaultNodeData(),
  type: nodeTypeSchema.enum.followUp,
  ...props.nodeProps,
  data: {
    name: "Follow Up",
    isStartNode: false,
    ...props.dataProps,
    details: {
      steps: [followUpStepDefaultFn()],
      ...props.detailProps,
    },
  },
})
