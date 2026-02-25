"use client"

import type { SendWaTemplateMessageStepSchema } from "@aha.chat/flow-config"
import { MessageSquareIcon } from "lucide-react"

type SendWaTemplateMessageStepViewerProps = {
  data: SendWaTemplateMessageStepSchema
}

export const SendWaTemplateMessageStepViewer = (
  props: SendWaTemplateMessageStepViewerProps,
) => {
  const { data } = props

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg bg-secondary">
      <div className="px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <MessageSquareIcon size={16} />
          <div>
            <div className="font-medium">
              {data.template.name || "Template Message"}
            </div>
            {data.template.languageCode && (
              <div className="text-muted-foreground text-xs">
                {data.template.languageCode}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
