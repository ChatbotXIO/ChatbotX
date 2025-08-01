"use client"

import { Card, CardFooter, CardHeader } from "@/components/ui/card"
import { ButtonGroupViewer } from "@/features/flows/react-flow/steps/button/viewer"
import type { SendAudioStepSchema } from "@aha.chat/flow-config"

import { Volume2 } from "lucide-react"

export const SendAudioStepViewer = ({
  data,
}: { data: SendAudioStepSchema }) => {
  const getFileNameFromUrl = () => {
    const urlObject = new URL(data.url as string)
    const path = urlObject.pathname
    return urlObject.pathname.substring(path.lastIndexOf("/") + 1)
  }

  return (
    <Card className="mb-2">
      <CardHeader className="flex flex-col items-center">
        <Volume2 size={30} color="gray" />
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
