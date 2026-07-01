import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { MouseEvent } from "react"
import { useFlowMutation } from "../flow-mutation-context"

export function DeleteNode({ nodeId }: { nodeId: string }) {
  const t = useTranslations()
  const { isFlowMutating, deleteNode } = useFlowMutation()

  const onDelete = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (isFlowMutating) {
      return
    }

    // Persist-first delete: removes THIS node (by id, never a forceToolbarVisible
    // scan) and immediately awaits the draft save instead of the 1s autosave
    // debounce, so a refresh right after delete can't resurrect the node.
    deleteNode(nodeId).catch(() => undefined)
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className="size-8 text-destructive hover:text-destructive"
          disabled={isFlowMutating}
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
