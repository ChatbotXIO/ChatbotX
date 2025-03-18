import { useNodes, useViewport } from "@xyflow/react"
import type { NodeType } from "../../types"

export const guessLabelAndPosition = (nodeType: NodeType) => {
  const nodes = useNodes()
  const { x, y } = useViewport()

  let labelVersion = 1
  for (const node of nodes) {
    if (node.type === nodeType) {
      labelVersion++
    }
  }

  return { labelVersion, position: { x, y } }
}
