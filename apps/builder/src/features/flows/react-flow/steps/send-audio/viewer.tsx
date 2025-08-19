"use client"

import type { SendAudioStepSchema } from "@aha.chat/flow-config"
import { Card, CardFooter, CardHeader } from "@aha.chat/ui/components/ui/card"
import { Volume2 } from "lucide-react"
import { ButtonGroupViewer } from "@/features/flows/react-flow/steps/button/viewer"

type SendAudioStepViewerProps = {
  data: SendAudioStepSchema
}

export const SendAudioStepViewer = (props: SendAudioStepViewerProps) => {
  const { data } = props
  const getFileNameFromUrl = () => {
    const urlObject = new URL(data.url as string)
    const path = urlObject.pathname
    return urlObject.pathname.substring(path.lastIndexOf("/") + 1)
  }

  return (
    <Card className="mb-2">
      <CardHeader className="flex flex-col items-center">
        <Volume2 color="gray" size={30} />
        <p>{getFileNameFromUrl()}</p>
      </CardHeader>
      {data.buttons.length > 0 && (
        <CardFooter className="bg-gray-200 p-2">
          <ButtonGroupViewer data={data.buttons} />
        </CardFooter>
      )}
    </Card>
  )
}
