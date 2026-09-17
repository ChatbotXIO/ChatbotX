"use client"

import type { WhatsappCallButtonStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { PhoneIcon } from "lucide-react"

type WhatsappCallButtonStepViewerProps = {
  data: WhatsappCallButtonStepSchema
}

const WhatsappCallButtonStepViewer = (
  props: WhatsappCallButtonStepViewerProps,
) => {
  const { data } = props

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <p className="bg-gray-200 px-4 py-2 dark:bg-neutral-600">{data.text}</p>
        <div className="flex items-center justify-center gap-1.5 border-border border-t bg-gray-100 px-4 py-2 text-center font-medium text-sm dark:bg-neutral-700">
          <PhoneIcon aria-hidden className="size-3.5" />
          {data.buttonLabel}
        </div>
      </CardContent>
    </Card>
  )
}

export default WhatsappCallButtonStepViewer
