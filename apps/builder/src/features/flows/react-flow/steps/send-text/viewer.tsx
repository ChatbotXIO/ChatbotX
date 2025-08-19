"use client"

import type { SendTextStepSchema } from "@aha.chat/flow-config"
import { ButtonGroupViewer } from "../button/viewer"

type SendTextStepViewerProps = {
  data: SendTextStepSchema
}

export const SendTextStepViewer = (props: SendTextStepViewerProps) => {
  const { data } = props

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg bg-secondary">
      <p className="px-4 py-2">{data.message}</p>
      <div className="bg-slate-200 px-3 py-2">
        <ButtonGroupViewer data={data.buttons} />
      </div>
    </div>
  )
}

export default SendTextStepViewer
