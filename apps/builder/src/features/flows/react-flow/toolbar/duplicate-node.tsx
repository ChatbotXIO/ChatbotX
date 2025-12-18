import type { FlowNode } from "@aha.chat/flow-config"
import { Button } from "@aha.chat/ui/components/ui/button"
import { createId } from "@paralleldrive/cuid2"
import { useReactFlow } from "@xyflow/react"
import { CopyIcon } from "lucide-react"
import { type MouseEvent, useCallback } from "react"
import { clone } from "remeda"

export function DuplicateNode() {
  const { addNodes, getNodes } = useReactFlow()

  const duplicateNode = useCallback(
    (node: FlowNode) => {
      const newNodeData = {
        name: `${node.data.name} Copy`,
        details: clone(node.data.details),
      }
      if ("beforeStep" in newNodeData.details) {
        newNodeData.details.beforeStep.id = createId()
      }

      if ("steps" in newNodeData.details) {
        newNodeData.details.steps = newNodeData.details.steps.map((step) => {
          if ("buttons" in step) {
            step.buttons = step.buttons.map((button) => ({
              ...button,
              id: createId(),
              beforeStep: null,
              buttonType: null,
            }))
          }
          return { ...step, id: createId() }
        })
      }

      addNodes([
        {
          id: createId(),
          type: node.type,
          position: {
            x: node.position.x + 100,
            y: node.position.y + 100,
          },
          data: newNodeData,
        },
      ])
    },
    [addNodes],
  )

  const onClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const allNodes = getNodes()
    const activeNode = allNodes.find((n) => n.data.forceToolbarVisible)
    if (activeNode) {
      duplicateNode(activeNode as FlowNode)
    }
  }

  return (
    <Button className="size-8" onClick={onClick} size="icon" variant="ghost">
      <CopyIcon />
    </Button>
  )
}
