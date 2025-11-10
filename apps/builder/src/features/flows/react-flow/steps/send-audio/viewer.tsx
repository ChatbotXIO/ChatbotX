"use client"

import type { SendAudioStepSchema } from "@aha.chat/flow-config"
import { Volume2Icon } from "lucide-react"
import { ButtonGroupViewer } from "../button/viewer"

type SendAudioStepViewerProps = {
  data: SendAudioStepSchema
}

const SendAudioStepViewer = (props: SendAudioStepViewerProps) => {
  const { data } = props

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg bg-secondary">
      {data.url && (
        <div className="flex items-center justify-start gap-2 px-4 py-2">
          <Volume2Icon size={24} />
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

export default SendAudioStepViewer
