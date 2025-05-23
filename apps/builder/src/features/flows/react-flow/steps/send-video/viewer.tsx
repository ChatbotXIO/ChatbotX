"use client"

import { Card, CardFooter, CardHeader } from "@/components/ui/card"
import { ButtonGroupViewer } from "@/features/flows/react-flow/steps/button/viewer"
import type { SendVideoStepSchema } from "@ahachat.ai/flow-config"

export const SendVideoStepViewer = ({
  data,
}: {
  data: SendVideoStepSchema
}) => {
  return (
    <Card className="mb-2">
      <CardHeader className="p-0">
        <video className="rounded-xl" src={data.url} controls={false} muted />
      </CardHeader>
      {data.buttons.length > 0 && (
        <CardFooter className="bg-gray-200 p-2">
          <ButtonGroupViewer data={data.buttons} />
        </CardFooter>
      )}
    </Card>
  )
}
