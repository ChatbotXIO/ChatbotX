import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@aha.chat/ui/components/ui/tooltip"
import { useReactFlow } from "@xyflow/react"
import { PlayIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type MouseEvent, useCallback } from "react"

export function SetStartNode() {
  const t = useTranslations()
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
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className="size-8"
          onClick={onClick}
          size="icon"
          variant="ghost"
        >
          <PlayIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{t("actions.setStartNode")}</p>
      </TooltipContent>
    </Tooltip>
  )
}
