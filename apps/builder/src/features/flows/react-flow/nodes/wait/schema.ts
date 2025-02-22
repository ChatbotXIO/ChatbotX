import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import {
  waitBlockDefaultValue,
  waitBlockSchema,
} from "../../blocks/wait/schema"
import { NodeType, baseNodeSchema } from "../../types"

export const waitNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.StartFlow),
  data: z.object({
    name: z.string().min(1).max(255).trim(),
    blocks: z.array(waitBlockSchema),
  }),
})

export type WaitNodeSchema = z.infer<typeof waitNodeSchema>

export const waitNodeDefaultValue = (): WaitNodeSchema => {
  return {
    id: createId(),
    type: NodeType.StartFlow,
    position: {
      x: 100,
      y: 100,
    },
    data: {
      name: "Wait",
      blocks: [waitBlockDefaultValue()],
    },
  }
}
