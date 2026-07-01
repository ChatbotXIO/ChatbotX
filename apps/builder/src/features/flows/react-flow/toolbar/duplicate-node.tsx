import type { FlowNode } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useReactFlow } from "@xyflow/react"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { MouseEvent } from "react"
import { useFlowMutation } from "../flow-mutation-context"

export function DuplicateNode({ nodeId }: { nodeId: string }) {
  const t = useTranslations()
  const { getNodes } = useReactFlow()
  const { isFlowMutating, duplicateNode } = useFlowMutation()

  const onClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (isFlowMutating) {
      return
    }

    // Resolve the source by THIS node's id (passed from NodeViewer), never a
    // `forceToolbarVisible` scan: overlapping nodes can flag more than one and the
    // first match would be the wrong node.
    const sourceNode = getNodes().find((n) => n.id === nodeId)
    if (sourceNode) {
      duplicateNode(sourceNode as unknown as FlowNode).catch(() => undefined)
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className="size-8"
          disabled={isFlowMutating}
          onClick={onClick}
          size="icon"
          variant="ghost"
        >
          {isFlowMutating ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <CopyIcon />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{t("actions.duplicate")}</p>
      </TooltipContent>
    </Tooltip>
  )
}
