import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import {
  startFlowBlockDefaultValue,
  startFlowBlockSchema,
} from "../../blocks/start-flow/schema"
import { NodeType, baseNodeSchema } from "../../types"

export const startFlowNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.StartFlow),
  data: z.object({
    name: z.string().min(1).max(255).trim(),
    blocks: z.array(startFlowBlockSchema),
  }),
})

export type StartFlowNodeSchema = z.infer<typeof startFlowNodeSchema>

export const startFlowNodeDefaultValue = ({
  labelVersion,
  position = { x: 100, y: 100 },
}: {
  labelVersion: number
  position?: { x: number; y: number }
}): StartFlowNodeSchema => {
  return {
    id: createId(),
    type: NodeType.StartFlow,
    position,
    data: {
      name: `Start Flow #${labelVersion}`,
      blocks: [startFlowBlockDefaultValue()],
    },
  }
}
