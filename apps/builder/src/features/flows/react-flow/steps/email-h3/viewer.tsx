"use client"

import type { EmailH3StepSchema } from "@aha.chat/flow-config"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"

type EmailH3StepViewerProps = {
  data: EmailH3StepSchema
}

export default function EmailH3StepViewer(props: EmailH3StepViewerProps) {
  const { data } = props

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <p className="bg-gray-200 px-4 py-2 dark:bg-neutral-600">{data.text}</p>
      </CardContent>
    </Card>
  )
}
