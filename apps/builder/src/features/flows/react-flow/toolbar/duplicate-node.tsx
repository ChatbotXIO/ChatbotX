import {
  type ButtonStepProps,
  ButtonType,
  type StepsProps,
} from "@aha.chat/flow-config"
import { Button } from "@aha.chat/ui/components/ui/button"
import { createId } from "@paralleldrive/cuid2"
import { type Node, useNodes, useReactFlow } from "@xyflow/react"
import { CopyIcon } from "lucide-react"
import { type MouseEvent, useCallback } from "react"

export function DuplicateNode() {
  const nodes = useNodes()
  const reactFlow = useReactFlow()
  const { addNodes, setEdges, addEdges } = reactFlow

  const cloneButtons = useCallback(
    ({
      newNodeId,
      step,
    }: {
      newNodeId: string
      step: { buttons: ButtonStepProps[] }
    }) => {
      {
        const buttons = step.buttons.map((button) => ({
          ...button,
          id: createId(),
        }))
        const sendMessageButtons = step.buttons.filter(
          (btn: ButtonStepProps) => btn.buttonType === ButtonType.SendMessage,
        )
        for (const btn of sendMessageButtons) {
          addEdges({
            id: btn.id,
            source: newNodeId,
            target: btn.beforeStep.nodeId as string,
            sourceHandle: btn.id,
            targetHandle: btn.beforeStep.nodeId,
            type: "delete",
            data: {
              onDelete: (edgeId: string) => {
                setEdges((eds) => eds.filter((e) => e.id !== edgeId))
              },
            },
          })
        }
        return buttons
      }
    },
    [setEdges, addEdges],
  )

  const cloneSteps = useCallback(
    ({ newNodeId, node }: { newNodeId: string; node: Node }) => {
      const steps = (("steps" in node.data ? node.data.steps : []) ??
        []) as StepsProps
      if (steps) {
        return steps.map((step) => {
          const hasButtons = "buttons" in step && Array.isArray(step.buttons)
          if (hasButtons) {
            step.buttons = cloneButtons({ step, newNodeId })
          }
          return { ...step, id: createId() }
        })
      }
    },
    [cloneButtons],
  )

  const duplicateNode = useCallback(
    (node: Node) => {
      const newNodeId = createId()
      const newNode = {
        data: {
          ...node.data,
          beforeStep: null,
          afterStep: null,
          isStartNode: false,
          steps: cloneSteps({ newNodeId, node }),
        },
        id: newNodeId,
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
