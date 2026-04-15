"use client"

import type { SendWaTemplateMessageStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { Position } from "@xyflow/react"
import { MessageSquareIcon } from "lucide-react"
import { BaseHandle } from "@/components/base-handle"

type SendWaTemplateMessageStepViewerProps = {
  data: SendWaTemplateMessageStepSchema
}

export const SendWaTemplateMessageStepViewer = (
  props: SendWaTemplateMessageStepViewerProps,
) => {
  const { data } = props

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="bg-gray-200 px-4 py-2 dark:bg-neutral-600">
          <div className="mb-1 flex items-center gap-2">
            <MessageSquareIcon size={16} />
            <span className="font-medium text-sm">
              {data.template.name || "Template Message"}
            </span>
          </div>
          {data.template.language && (
            <div className="text-muted-foreground text-xs">
              {data.template.language}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 bg-gray-100 px-3 py-2 dark:bg-neutral-700">
          <div
            className="relative flex items-center justify-end gap-2"
            key={data.buttons[0].id}
          >
            <span className={cn("font-medium text-sm", "text-green-600")}>
              {data.buttons[0].label}
            </span>
            <div
              className={cn(
                "h-3 w-3 rounded-full border-2",
                "border-green-500",
              )}
            >
              <BaseHandle
                className={cn(
                  "right-[6px]! h-3! w-3! opacity-0!",
                  "border-green-500",
                )}
                id={data.buttons[0].id}
                onConnectedClassName={cn("bg-green-500!")}
                position={Position.Right}
                type="source"
              />
            </div>
          </div>

          <div
            className="relative flex items-center justify-end gap-2"
            key={data.buttons[1].id}
          >
            <span className={cn("font-medium text-sm", "text-red-600")}>
              {data.buttons[1].label}
            </span>
            <div
              className={cn("h-3 w-3 rounded-full border-2", "border-red-500")}
            >
              <BaseHandle
                className={cn(
                  "right-[6px]! h-3! w-3! opacity-0!",
                  "border-red-500",
                )}
                id={data.buttons[1].id}
                onConnectedClassName={cn("bg-red-500!")}
                position={Position.Right}
                type="source"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
