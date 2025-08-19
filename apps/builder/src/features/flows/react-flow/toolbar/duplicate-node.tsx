import { Button } from "@aha.chat/ui/components/ui/button"
import { type Node, useNodes } from "@xyflow/react"
import { CopyIcon } from "lucide-react"
import { type MouseEvent, useCallback } from "react"

export function DuplicateNode() {
  const nodes = useNodes()

  const duplicateNode = useCallback((_node: Node) => {
    // toast.success("Copied Node ID")
  }, [])

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
