import { Button } from "@/components/ui/button"
import { useReactFlow } from "@xyflow/react"
import { TrashIcon } from "lucide-react"
import { useCallback, type MouseEvent } from "react"

export function DeleteNode() {
  const { setNodes, getNodes } = useReactFlow()

  const nodes = getNodes()
  const startNode = nodes.find((n) => n.data.isStartNode)
  const targetNode = nodes.find((n) => n.data.forceToolbarVisible)

  const deleteNode = useCallback(() => {
    setNodes(nodes.filter((node) => !node.data.forceToolbarVisible))
  }, [setNodes, nodes])

  const onClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    deleteNode()
  }

  return startNode?.id === targetNode?.id ? null : (
    <Button variant="ghost" size="icon" className="size-8" onClick={onClick}>
      <TrashIcon />
    </Button>
  )
}
