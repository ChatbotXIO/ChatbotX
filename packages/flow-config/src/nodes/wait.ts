import { z } from "zod"
import { waitStepDefaultFn, waitStepSchema } from "../steps/wait"
import {
  baseNodeDefaultFn,
  baseNodeSchema,
  type NodeFnProps,
  NodeType,
} from "./base"

export const waitNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.wait),
  data: z.object({
    name: z.string().trim().min(1).max(255),
    isStartNode: z.boolean(),
    beforeStep: waitStepSchema,
    afterStep: z.null(),
    steps: z.null(),
  }),
})

export type WaitNodeSchema = typeof waitNodeSchema
export type WaitNodeProps = z.input<typeof waitNodeSchema>

export const waitNodeDefaultFn = (
  props: NodeFnProps<WaitNodeProps>,
): WaitNodeProps =>
  baseNodeDefaultFn<WaitNodeProps>({
    ...props,
    type: NodeType.wait,
    beforeStep: waitStepDefaultFn(),
  })
