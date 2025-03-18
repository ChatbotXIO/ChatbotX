import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import {
  startFlowBlockDefaultFn,
  startFlowBlockSchema,
} from "../../blocks/start-flow/schema"
import { NodeType, baseNodeSchema } from "../../types"
import { guessLabelAndPosition } from "../utils/name-helper"

export const startFlowNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.StartFlow),
  data: z.object({
    name: z.string().min(1).max(255).trim(),
    blocks: z.array(startFlowBlockSchema),
  }),
})

export type StartFlowNodeSchema = z.infer<typeof startFlowNodeSchema>

export const startFlowNodeDefaultFn = (): StartFlowNodeSchema => {
  const { labelVersion, position } = guessLabelAndPosition(NodeType.StartFlow)

  return {
    id: createId(),
    type: NodeType.StartFlow,
    position,
    data: {
      name: `Start Flow #${labelVersion}`,
      blocks: [startFlowBlockDefaultFn()],
    },
  }
}
