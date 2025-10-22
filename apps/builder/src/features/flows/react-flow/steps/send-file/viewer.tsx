"use client"

import type { SendFileStepSchema } from "@aha.chat/flow-config"
import { PaperclipIcon } from "lucide-react"
import { ButtonGroupViewer } from "../button/viewer"

type SendFileStepViewerProps = {
  data: SendFileStepSchema
}

const SendFileStepViewer = (props: SendFileStepViewerProps) => {
  const { data } = props

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg bg-secondary">
      {data.url && (
        <div className="flex items-center justify-start gap-2 px-4 py-2">
          <PaperclipIcon size={24} />
          <span className="flex-1 truncate">{data.url}</span>
        </div>
      )}
      {data.buttons.length > 0 && (
        <div className="bg-slate-200 px-3 py-2">
          <ButtonGroupViewer data={data.buttons} />
        </div>
      )}
    </div>
  )
}

export default SendFileStepViewer
