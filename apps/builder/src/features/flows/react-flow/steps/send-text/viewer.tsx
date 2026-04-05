"use client"

import type { SendTextStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { ButtonGroupViewer } from "../button/viewer"

type SendTextStepViewerProps = {
  data: SendTextStepSchema
}

const SendTextStepViewer = (props: SendTextStepViewerProps) => {
  const { data } = props

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <p className="bg-gray-200 px-4 py-2 dark:bg-neutral-600">{data.text}</p>
        {data.buttons.length > 0 && <ButtonGroupViewer data={data.buttons} />}
      </CardContent>
    </Card>
  )
}

export default SendTextStepViewer
