import { z } from "zod"
import { actionSteps } from "../shared"
import {
  baseNodeDefaultFn,
  baseNodeSchema,
  type NodeFnProps,
  NodeType,
} from "./base"

export const performActionNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.performAction),
  data: z.object({
    name: z.string().trim().min(1).max(255),
    isStartNode: z.boolean(),
    beforeStep: z.null(),
    afterStep: z.null(),
    steps: z.array(z.union(actionSteps)),
  }),
})
export type PerformActionNodeSchema = typeof performActionNodeSchema
export type PerformActionNodeProps = z.infer<typeof performActionNodeSchema>

export const performActionNodeDefaultFn = (
  props: NodeFnProps<PerformActionNodeProps>,
): PerformActionNodeProps =>
  baseNodeDefaultFn<PerformActionNodeProps>({
    ...props,
    type: NodeType.performAction,
  })
