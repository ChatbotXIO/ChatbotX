"use client"

import type { EmailHeaderStepSchema } from "@aha.chat/flow-config"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"

type EmailHeaderStepViewerProps = {
  data: EmailHeaderStepSchema
}

export default function EmailHeaderStepViewer(
  props: EmailHeaderStepViewerProps,
) {
  const { data } = props

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <p className="bg-gray-200 px-4 py-2 dark:bg-neutral-600">
          {data.topicId}
        </p>
        <p className="bg-gray-200 px-4 py-2 dark:bg-neutral-600">{data.from}</p>
        <p className="bg-gray-200 px-4 py-2 dark:bg-neutral-600">{data.to}</p>
        <p className="bg-gray-200 px-4 py-2 dark:bg-neutral-600">
          {data.subject}
        </p>
        <p className="bg-gray-200 px-4 py-2 dark:bg-neutral-600">
          {data.preheader}
        </p>
      </CardContent>
    </Card>
  )
}
