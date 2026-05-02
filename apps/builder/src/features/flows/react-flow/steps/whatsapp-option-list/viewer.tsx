"use client"

import type { WhatsappOptionListStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { Position } from "@xyflow/react"
import { BaseHandle } from "@/components/base-handle"

type WhatsappOptionListStepViewerProps = {
  data: WhatsappOptionListStepSchema
}

const WhatsappOptionListStepViewer = (
  props: WhatsappOptionListStepViewerProps,
) => {
  const { data } = props

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <p className="bg-gray-200 px-4 py-2 dark:bg-neutral-600">{data.text}</p>
        <div className="border-border border-t bg-gray-100 px-4 py-2 text-center font-medium text-sm dark:bg-neutral-700">
          {data.buttonLabel}
        </div>
        <div className="flex flex-1 flex-col gap-2 bg-gray-100 px-3 pb-2 dark:bg-neutral-700">
          {data.options.map((option) => (
            <div
              className="relative flex items-center justify-between rounded-lg bg-secondary px-3 py-2"
              key={option.id}
            >
              <div className="flex flex-col">
                <span className="font-medium text-sm">{option.title}</span>
                {option.description ? (
                  <span className="text-muted-foreground text-xs">
                    {option.description}
                  </span>
                ) : null}
              </div>
              <BaseHandle
                id={option.id}
                position={Position.Right}
                type="source"
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default WhatsappOptionListStepViewer
