import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { TriangleAlertIcon } from "lucide-react"

export const ErrorAlert = ({ message }: { message: string }) => {
  return (
    <Tooltip>
      <TooltipTrigger>
        <TriangleAlertIcon size={16} className="text-destructive" />
      </TooltipTrigger>
      <TooltipContent>
        <p>{message}</p>
      </TooltipContent>
    </Tooltip>
  )
}
