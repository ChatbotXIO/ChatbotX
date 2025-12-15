import { Button } from "@aha.chat/ui/components/ui/button"
import { useNodes } from "@xyflow/react"
import { FingerprintIcon } from "lucide-react"
import type { MouseEvent } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"

export function GetNodeId() {
  const [_, copy] = useCopyToClipboard()
  const nodes = useNodes()

  const onClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const activeNode = nodes.find((n) => n.data.forceToolbarVisible)
    if (activeNode) {
      copy(activeNode.id).then(() => {
        toast.success("Copied Node ID")
      })
    }
  }

  return (
    <Button
      className="size-8"
      onClick={onClick}
      size="icon"
      type="button"
      variant="ghost"
    >
      <FingerprintIcon />
    </Button>
  )
}
