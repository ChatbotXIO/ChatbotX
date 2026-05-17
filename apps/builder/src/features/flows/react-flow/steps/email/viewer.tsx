"use client"

import type { EmailStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { PageElementViewer } from "../../components/page-element-builder"

type EmailStepViewerProps = {
  data: EmailStepSchema
}

export default function EmailStepViewer(props: EmailStepViewerProps) {
  const { data } = props

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <p className="bg-gray-200 px-4 py-1 font-bold dark:bg-neutral-600">
          {data.subject}
        </p>
        {data.elements.length > 0 && (
          <div className="flex flex-col gap-2 px-4 py-2">
            {data.elements.map((element) => (
              <PageElementViewer data={element} key={element.id} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
