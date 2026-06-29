import type { FlowNode } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useReactFlow } from "@xyflow/react"
import { CopyIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type MouseEvent, useCallback } from "react"
import { duplicateFlowNode } from "./duplicate-node-data"

export function DuplicateNode() {
  const t = useTranslations()
  const { addNodes, getNodes } = useReactFlow()

  const duplicateNode = useCallback(
    (node: FlowNode) => {
      addNodes([duplicateFlowNode(node)])
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
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className="size-8"
          onClick={onClick}
          size="icon"
          variant="ghost"
        >
          <CopyIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{t("actions.duplicate")}</p>
      </TooltipContent>
    </Tooltip>
  )
}
