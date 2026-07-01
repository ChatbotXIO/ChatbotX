import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { FingerprintIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { MouseEvent } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"

export function GetNodeId({ nodeId }: { nodeId: string }) {
  const t = useTranslations()
  const [_, copy] = useCopyToClipboard()

  const onClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Copy THIS node's id (from NodeViewer), not a `forceToolbarVisible` scan:
    // overlapping nodes can flag more than one and the scan would pick the wrong id.
    copy(nodeId).then(() => {
      toast.success("Copied Node ID")
    })
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className="size-8"
          onClick={onClick}
          size="icon"
          type="button"
          variant="ghost"
        >
          <FingerprintIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{t("actions.getNodeId")}</p>
      </TooltipContent>
    </Tooltip>
  )
}
