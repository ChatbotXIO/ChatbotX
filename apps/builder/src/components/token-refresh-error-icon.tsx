import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { TriangleAlertIcon } from "lucide-react"

export function TokenRefreshErrorIcon({ message }: { message: string }) {
  return (
    <Tooltip>
      <TooltipTrigger>
        <TriangleAlertIcon className="text-destructive" size={16} />
      </TooltipTrigger>
      <TooltipContent>
        <p>{message}</p>
      </TooltipContent>
    </Tooltip>
  )
}
