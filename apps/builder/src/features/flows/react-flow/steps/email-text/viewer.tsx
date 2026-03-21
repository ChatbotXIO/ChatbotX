"use client"

import type { EmailTextStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"

type EmailTextStepViewerProps = {
  data: EmailTextStepSchema
}

export default function EmailTextStepViewer(props: EmailTextStepViewerProps) {
  const { data } = props

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <p className="bg-gray-200 px-4 py-2 dark:bg-neutral-600">{data.text}</p>
      </CardContent>
    </Card>
  )
}
