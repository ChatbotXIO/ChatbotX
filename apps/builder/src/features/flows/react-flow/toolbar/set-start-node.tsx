import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useReactFlow } from "@xyflow/react"
import { PlayIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type MouseEvent, useCallback } from "react"

export function SetStartNode({ nodeId }: { nodeId: string }) {
  const t = useTranslations()
  const { setNodes, getNodes } = useReactFlow()

  // Act on THIS node by its id (from NodeViewer), not a `forceToolbarVisible`
  // scan: overlapping nodes (e.g. after a duplicate) can flag more than one.
  const node = getNodes().find((n) => n.id === nodeId)

  const setStartNode = useCallback(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          isStartNode: n.id === nodeId,
        },
      })),
    )
  }, [setNodes, nodeId])

  const onClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    setStartNode()
  }

  return node?.data.isStartNode ? null : (
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
