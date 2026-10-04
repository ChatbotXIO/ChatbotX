import { z } from "zod"
import { conditionStepDefaultFn, conditionStepSchema } from "../steps/condition"
import {
  baseNodeDataSchema,
  baseNodeSchema,
  type DefaultNodeProps,
  defaultNodeData,
  nodeTypeSchema,
} from "./base"

export const conditionNodeSchema = baseNodeSchema.extend({
  type: z
    .literal(nodeTypeSchema.enum.condition)
    .describe(
      'Node type "condition": branches the flow on contact conditions. `data.details.steps` holds exactly one condition step; its case ids and `otherwiseId` are the edge source handles.',
    ),
  data: baseNodeDataSchema.extend({
    details: z.object({
      steps: z.array(conditionStepSchema).min(1).max(1),
    }),
  }),
})
export type ConditionNodeSchema = z.infer<typeof conditionNodeSchema>

export const conditionNodeDefaultFn = (
  props: DefaultNodeProps,
): ConditionNodeSchema => ({
  ...defaultNodeData(),
  type: nodeTypeSchema.enum.condition,
  ...props.nodeProps,
  data: {
    name: "Condition",
    isStartNode: false,
    ...props.dataProps,
    details: {
      steps: [conditionStepDefaultFn()],
      ...props.detailProps,
    },
  },
})
