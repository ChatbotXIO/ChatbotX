import { PanelAction } from "@/features/flows/react-flow/types"
import { createId } from "@paralleldrive/cuid2"
import type { Node } from "@xyflow/react"
import { z } from "zod"
import {
  waitBlockDefaultValue,
  waitBlockSchema,
} from "../../blocks/wait/schema"

export const waitNodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).trim(),
  blocks: z.array(waitBlockSchema),
})

export type WaitNodeSchema = z.infer<typeof waitNodeSchema>

export const waitNodeDefaultValue = (nodes: Node[]): WaitNodeSchema => {
  let labelVersion = 0
  for (const node of nodes) {
    if (node.type === PanelAction.Wait) {
      const matched = (node.data.name as string).match(/^Wait #(\d+)$/)
      if (matched) {
        const version = Number.parseInt(matched[1] ?? "0", 10)
        if (version > labelVersion) {
          labelVersion = version
        }
      }
    }
  }

  return {
    id: createId(),
    name: `Wait #${labelVersion + 1}`,
    blocks: [waitBlockDefaultValue()],
  }
}
