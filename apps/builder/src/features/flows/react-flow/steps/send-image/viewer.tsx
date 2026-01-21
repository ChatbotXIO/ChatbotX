"use client"

import type { SendImageStepSchema } from "@aha.chat/flow-config"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import Image from "next/image"
import { ButtonGroupViewer } from "../button/viewer"

type SendImageStepViewerProps = {
  data: SendImageStepSchema
}

const SendImageStepViewer = (props: SendImageStepViewerProps) => {
  const { data } = props

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        {data.url?.startsWith("https") && (
          <div className="relative h-[150px]">
            <Image
              alt={data.id}
              className="h-full w-full object-contain"
              fill={true}
              src={data.url}
            />
          </div>
        )}
        {data.buttons.length > 0 && <ButtonGroupViewer data={data.buttons} />}
      </CardContent>
    </Card>
  )
}

export default SendImageStepViewer
