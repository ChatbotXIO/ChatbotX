import type { ButtonStepProps, StepsProps } from "@aha.chat/flow-config"
import { Button } from "@aha.chat/ui/components/ui/button"
import { createId } from "@paralleldrive/cuid2"
import { type Node, useNodes, useReactFlow } from "@xyflow/react"
import { CopyIcon } from "lucide-react"
import { type MouseEvent, useCallback } from "react"

export function DuplicateNode() {
  const nodes = useNodes()
  const reactFlow = useReactFlow()
  const { addNodes } = reactFlow

  const cloneButtons = useCallback(
    (buttons: ButtonStepProps[]) =>
      buttons.map((button) => ({
        ...button,
        id: createId(),
        beforeStep: null,
        buttonType: null,
      })),
    [],
  )

  const cloneSteps = useCallback(
    ({ node }: { node: Node }) => {
      const steps = (("steps" in node.data ? node.data.steps : []) ??
        []) as StepsProps
      if (steps) {
        return steps.map((step) => {
          const hasButtons = "buttons" in step && Array.isArray(step.buttons)
          if (hasButtons) {
            step.buttons = cloneButtons(step.buttons)
          }
          return { ...step, id: createId() }
        })
      }
    },
    [cloneButtons],
  )

  const duplicateNode = useCallback(
    (node: Node) => {
      const newNode = {
        data: {
          ...node.data,
          isStartNode: false,
          steps: cloneSteps({ node }),
        },
        id: createId(),
        type: node.type,
        position: {
          x: node.position.x + 100,
          y: node.position.y + 100,
        },
        source: null,
        target: null,
        sourceHandle: null,
        targetHandle: null,
      }
      addNodes([newNode])
    },
    [addNodes, cloneSteps],
  )

  const onClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const activeNode = nodes.find((n) => n.data.forceToolbarVisible)
    if (activeNode) {
      duplicateNode(activeNode)
    }
  }

  return (
    <Button className="size-8" onClick={onClick} size="icon" variant="ghost">
      <CopyIcon />
    </Button>
  )
}
