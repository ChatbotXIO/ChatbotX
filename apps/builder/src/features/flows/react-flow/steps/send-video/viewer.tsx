"use client"

import type { SendVideoStepSchema } from "@aha.chat/flow-config"
import { Card, CardFooter, CardHeader } from "@aha.chat/ui/components/ui/card"
import { ButtonGroupViewer } from "@/features/flows/react-flow/steps/button/viewer"

type SendVideoStepViewerProps = {
  data: SendVideoStepSchema
}

export const SendVideoStepViewer = (props: SendVideoStepViewerProps) => {
  const { data } = props

  return (
    <Card className="mb-2">
      <CardHeader className="p-0">
        <video className="rounded-xl" controls={false} muted src={data.url} />
      </CardHeader>
      {data.buttons.length > 0 && (
        <CardFooter className="bg-gray-200 p-2">
          <ButtonGroupViewer data={data.buttons} />
        </CardFooter>
      )}
    </Card>
  )
}
