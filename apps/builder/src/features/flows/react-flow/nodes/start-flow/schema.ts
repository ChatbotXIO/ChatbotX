import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import {
  startFlowStepDefaultFn,
  startFlowStepSchema,
} from "../../steps/start-flow/schema"
import { NodeType, baseNodeSchema } from "../../types"

export const startFlowNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.StartFlow),
  data: z.object({
    name: z.string().trim().min(1).max(255),
    steps: z.array(startFlowStepSchema),
  }),
})

export type StartFlowNodeSchema = z.infer<typeof startFlowNodeSchema>

export const startFlowNodeDefaultFn = (): StartFlowNodeSchema => {
  return {
    id: createId(),
    type: NodeType.StartFlow,
    position: { x: 100, y: 100 },
    measured: { width: 288, height: 100 },
    data: {
      name: "Start Flow #1",
      steps: [startFlowStepDefaultFn()],
    },
  }
}
