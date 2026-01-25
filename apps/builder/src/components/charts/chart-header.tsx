"use client"

import { CardHeader } from "@aha.chat/ui/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@aha.chat/ui/components/ui/tooltip"
import { InfoIcon } from "lucide-react"

type BarChartProps = {
  name: string
  helpMessage?: string
}

export default function ChartHeader({ name, helpMessage }: BarChartProps) {
  return (
    <CardHeader>
      <div className="flex items-center gap-2">
        {name}
        {helpMessage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon size={18} />
            </TooltipTrigger>
            <TooltipContent>
              <p>{helpMessage}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </CardHeader>
  )
}
