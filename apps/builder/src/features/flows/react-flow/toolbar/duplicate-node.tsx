import { Button } from "@/components/ui/button"
import { useNodes, type Node } from "@xyflow/react"
import { CopyIcon } from "lucide-react"
import { useCallback, type MouseEvent } from "react"

export function DuplicateNode() {
  const nodes = useNodes()

  const duplicateNode = useCallback((node: Node) => {
    console.log("duplicate node ID", node.id)
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
    <Button variant="ghost" size="icon" className="size-8" onClick={onClick}>
      <CopyIcon />
    </Button>
  )
}
