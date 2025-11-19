import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@aha.chat/ui/components/ui/tooltip"
import { TriangleAlertIcon } from "lucide-react"

export const ErrorAlert = ({ message }: { message: string }) => (
  <Tooltip>
    <TooltipTrigger>
      <TriangleAlertIcon className="text-destructive" size={16} />
    </TooltipTrigger>
    <TooltipContent>
      <p>{message}</p>
    </TooltipContent>
  </Tooltip>
)
