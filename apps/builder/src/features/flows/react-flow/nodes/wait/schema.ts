import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import {
  waitBlockDefaultFn,
  waitBlockSchema,
} from "../../blocks/wait/schema"
import { NodeType, baseNodeSchema } from "../../types"
import type { NewNodeProps } from "../types"

export const waitNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.Wait),
  data: z.object({
    name: z.string().min(1).max(255).trim(),
    blocks: z.array(waitBlockSchema),
  }),
})

export type WaitNodeSchema = z.infer<typeof waitNodeSchema>

export const waitNodeDefaultFn = ({ labelVersion, ...props }: NewNodeProps): WaitNodeSchema => {
  return {
    id: createId(),
    type: NodeType.Wait,
    measured: { width: 288, height: 100 },
    ...props,
    data: {
      name: `Wait #${labelVersion}`,
      blocks: [waitBlockDefaultFn()],
    },
  }
}
