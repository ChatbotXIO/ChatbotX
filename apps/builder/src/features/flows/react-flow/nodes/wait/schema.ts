import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import {
  waitBlockDefaultValue,
  waitBlockSchema,
} from "../../blocks/wait/schema"
import { NodeType, baseNodeSchema } from "../../types"

export const waitNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.Wait),
  data: z.object({
    name: z.string().min(1).max(255).trim(),
    blocks: z.array(waitBlockSchema),
  }),
})

export type WaitNodeSchema = z.infer<typeof waitNodeSchema>

export const waitNodeDefaultValue = ({
  labelVersion,
  position = { x: 100, y: 100 },
}: {
  labelVersion: number
  position?: { x: number; y: number }
}): WaitNodeSchema => {
  return {
    id: createId(),
    type: NodeType.Wait,
    position,
    data: {
      name: `Wait #${labelVersion}`,
      blocks: [waitBlockDefaultValue()],
    },
  }
}
