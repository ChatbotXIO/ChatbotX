"use client"

import type { SendTextStepSchema } from "@aha.chat/flow-config"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { ButtonGroupViewer } from "../button/viewer"

type SendTextStepViewerProps = {
  data: SendTextStepSchema
}

const SendTextStepViewer = (props: SendTextStepViewerProps) => {
  const { data } = props

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <p className="bg-gray-200 px-4 py-2 dark:bg-neutral-600">
          {data.message}
        </p>
        {data.buttons.length > 0 && <ButtonGroupViewer data={data.buttons} />}
      </CardContent>
    </Card>
  )
}

export default SendTextStepViewer
