import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useReactFlow } from "@xyflow/react"
import { TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { MouseEvent } from "react"
export function DeleteNode({ nodeId }: { nodeId: string }) {
  const t = useTranslations()
  const { deleteElements } = useReactFlow()

  const onDelete = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Delete THIS node by its id (passed from NodeViewer). Do NOT resolve the
    // target by scanning getNodes() for the first `forceToolbarVisible` node:
    // after a duplicate the clone overlaps the original and hover can flag both,
    // so a first-match scan deletes the wrong one (the original).
    deleteElements({
      nodes: [{ id: nodeId }],
    })
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className="size-8 text-destructive hover:text-destructive"
          onClick={onDelete}
          size="icon"
          type="button"
          variant="ghost"
        >
          <TrashIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{t("actions.delete")}</p>
      </TooltipContent>
    </Tooltip>
  )
}
