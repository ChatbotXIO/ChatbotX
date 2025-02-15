import { PanelAction } from "@/features/flows/react-flow/types"
import { createId } from "@paralleldrive/cuid2"
import type { Node } from "@xyflow/react"
import { z } from "zod"
import {
  startFlowBlockDefaultValue,
  startFlowBlockSchema,
} from "../../blocks/start-flow/schema"

export const startFlowNodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).trim(),
  blocks: z.array(startFlowBlockSchema),
})

export type StartFlowNodeSchema = z.infer<typeof startFlowNodeSchema>

export const startFlowNodeDefaultValue = (
  nodes: Node[],
): StartFlowNodeSchema => {
  let labelVersion = 0
  for (const node of nodes) {
    if (node.type === PanelAction.StartFlow) {
      const matched = (node.data.name as string).match(/^Start Flow #(\d+)$/)
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
    name: `Start Flow #${labelVersion + 1}`,
    blocks: [startFlowBlockDefaultValue()],
  }
}
