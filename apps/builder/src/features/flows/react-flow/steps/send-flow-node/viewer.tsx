"use client"

import type { SendFlowNodeStepSchema } from "@aha.chat/flow-config"

const SendFlowNodeStepViewer = ({
  data,
}: {
  data: SendFlowNodeStepSchema
}) => {
  return (
    <div className="items-center rounded-lg overflow-hidden justify-center bg-secondary">
      <p className="px-4 py-2">{data.nodeId}</p>
    </div>
  )
}

export default SendFlowNodeStepViewer
