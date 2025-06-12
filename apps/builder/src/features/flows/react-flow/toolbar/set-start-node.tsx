import { Button } from "@/components/ui/button"
import { useReactFlow } from "@xyflow/react"
import { PlayIcon } from "lucide-react"
import { useCallback, type MouseEvent } from "react"

export function SetStartNode() {
  const { setNodes, getNodes } = useReactFlow()

  const nodes = getNodes()
  const activeNode = nodes.find((n) => n.data.forceToolbarVisible)

  const setStartNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: {
            ...node.data,
            isStartNode: node.id === nodeId,
          },
        })),
      )
    },
    [setNodes],
  )

  const onClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (activeNode) {
      setStartNode(activeNode.id)
    }
  }

  return activeNode?.data.isStartNode ? null : (
    <Button variant="ghost" size="icon" className="size-8" onClick={onClick}>
      <PlayIcon />
    </Button>
  )
}
