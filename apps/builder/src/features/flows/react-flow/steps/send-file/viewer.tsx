"use client"

import type { SendFileStepSchema } from "@aha.chat/flow-config"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { PaperclipIcon } from "lucide-react"
import { ButtonGroupViewer } from "../button/viewer"

type SendFileStepViewerProps = {
  data: SendFileStepSchema
}

const SendFileStepViewer = (props: SendFileStepViewerProps) => {
  const { data } = props

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        {data.url && (
          <div className="flex items-center justify-start gap-2 px-4 py-2">
            <PaperclipIcon size={24} />
            <span className="flex-1 truncate">{data.url}</span>
          </div>
        )}
        {data.buttons.length > 0 && <ButtonGroupViewer data={data.buttons} />}
      </CardContent>
    </Card>
  )
}

export default SendFileStepViewer
