"use client"

import { CardHeader, CardTitle } from "@aha.chat/ui/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@aha.chat/ui/components/ui/tooltip"
import { InfoIcon } from "lucide-react"

type ChartHeaderProps = {
  title: string
  helpText?: string
}

export default function ChartHeader({ title, helpText }: ChartHeaderProps) {
  return (
    <CardHeader>
      <div className="flex items-center gap-2">
        <CardTitle>{title}</CardTitle>
        {helpText && (
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon size={18} />
            </TooltipTrigger>
            <TooltipContent>
              <p>{helpText}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </CardHeader>
  )
}
