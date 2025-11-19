import { z } from "zod"
import {
  splitTrafficStepDefaultFn,
  splitTrafficStepSchema,
} from "../steps/split-traffic"
import {
  baseNodeDefaultFn,
  baseNodeSchema,
  type NodePosition,
  NodeType,
} from "./base"

export const splitTrafficNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.splitTraffic),
  data: z.object({
    name: z.string().trim().min(1).max(255),
    isStartNode: z.boolean(),
    beforeStep: splitTrafficStepSchema,
    steps: z.null(),
    afterStep: z.null(),
  }),
})

export type SplitTrafficNodeSchema = z.input<typeof splitTrafficNodeSchema>

export const splitTrafficNodeDefaultFn = (props: {
  name: string
  position: NodePosition
}): SplitTrafficNodeSchema =>
  baseNodeDefaultFn<SplitTrafficNodeSchema>({
    ...props,
    type: NodeType.splitTraffic,
    beforeStep: splitTrafficStepDefaultFn(),
  })
