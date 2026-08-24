"use client"

import type { SendWaTemplateMessageStepSchema } from "@chatbotx.io/flow-config"
import { splitWaTemplateStepButtons } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { MessageSquareIcon } from "lucide-react"
import { StateHandle } from "../base/step-state-handles"
import { ButtonStepViewer } from "../button/viewer"

type SendWaTemplateMessageStepViewerProps = {
  data: SendWaTemplateMessageStepSchema
}

// Delivered/Failed delivery status branches, rendered with the shared labeled
// connector; every button after them is a template quick reply, rendered like
// any other step button.
const statusHandleTones = [
  {
    borderClass: "border-green-500",
    fillClass: "bg-green-500",
    labelClassName: "font-medium text-green-600 text-sm",
  },
  {
    borderClass: "border-red-500",
    fillClass: "bg-red-500",
    labelClassName: "font-medium text-red-600 text-sm",
  },
]

export const SendWaTemplateMessageStepViewer = (
  props: SendWaTemplateMessageStepViewerProps,
) => {
  const { data } = props
  const { statusButtons, quickReplyButtons } = splitWaTemplateStepButtons(
    data.buttons,
  )

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
          {statusButtons.map((button, buttonIndex) => (
            <div className="flex justify-end" key={button.id}>
              <StateHandle
                borderClass={statusHandleTones[buttonIndex]?.borderClass ?? ""}
                fillClass={statusHandleTones[buttonIndex]?.fillClass ?? ""}
                label={button.label}
                labelClassName={statusHandleTones[buttonIndex]?.labelClassName}
                stateId={button.id}
              />
            </div>
          ))}

          {quickReplyButtons.map((button) => (
            <ButtonStepViewer data={button} key={button.id} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
