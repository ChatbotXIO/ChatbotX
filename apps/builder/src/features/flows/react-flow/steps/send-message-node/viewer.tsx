"use client"

import type { SendMessageNodeStepSchema } from "./schema"

const SendMessageNodeStepViewer = ({
  data,
}: {
  data: SendMessageNodeStepSchema
}) => {
  return (
    <div className="items-center rounded-lg overflow-hidden justify-center bg-secondary">
      <p className="px-4 py-2">{data.nodeId}</p>
    </div>
  )
}

export default SendMessageNodeStepViewer
