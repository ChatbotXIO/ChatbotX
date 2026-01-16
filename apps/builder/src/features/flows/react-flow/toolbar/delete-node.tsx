import { Button } from "@aha.chat/ui/components/ui/button"
import { useReactFlow } from "@xyflow/react"
import { TrashIcon } from "lucide-react"
import type { MouseEvent } from "react"

export function DeleteNode() {
  const { deleteElements, getNodes } = useReactFlow()

  const onDelete = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const allNodes = getNodes()
    const targetNode = allNodes.find(
      (n) => n.data.forceToolbarVisible && !n.data.isStartNode,
    )

    if (targetNode) {
      deleteElements({
        nodes: [{ id: targetNode.id }],
      })
    }
  }

  return (
    <Button
      className="size-8 text-destructive hover:text-destructive"
      onClick={onDelete}
      size="icon"
      type="button"
      variant="ghost"
    >
      <TrashIcon />
    </Button>
  )
}
