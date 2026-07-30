"use client"

import { CardHeader, CardTitle } from "@chatbotx.io/ui/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
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
            <TooltipTrigger render={<InfoIcon size={18} />} />
            <TooltipContent>
              <p>{helpText}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </CardHeader>
  )
}
