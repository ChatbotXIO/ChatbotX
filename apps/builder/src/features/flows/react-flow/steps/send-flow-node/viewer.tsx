"use client"

import type { SendFlowNodeStepSchema } from "@aha.chat/flow-config"

type SendFlowNodeStepViewerProps = {
  data: SendFlowNodeStepSchema
}

const SendFlowNodeStepViewer = (props: SendFlowNodeStepViewerProps) => {
  const { data } = props

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg bg-secondary">
      <p className="px-4 py-2">{data.nodeId}</p>
    </div>
  )
}

export default SendFlowNodeStepViewer
