"use client"

import type { SendTextStepSchema } from "@ahachat.ai/flow-config"
import { ButtonGroupViewer } from "../button/viewer"

const SendTextStepViewer = ({
  data,
}: {
  data: SendTextStepSchema
}) => {
  return (
    <div className="items-center rounded-lg overflow-hidden justify-center bg-secondary">
      <p className="px-4 py-2">{data.message}</p>
      <div className="bg-slate-200 px-3 py-2">
        <ButtonGroupViewer data={data.buttons} />
      </div>
    </div>
  )
}

export default SendTextStepViewer
