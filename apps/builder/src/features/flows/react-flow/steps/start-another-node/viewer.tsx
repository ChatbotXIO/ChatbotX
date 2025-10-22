"use client"

import type { StartAnotherNodeStepSchema } from "@aha.chat/flow-config"
import { useNodes } from "@xyflow/react"

type SendNodeStepViewerProps = {
  data: StartAnotherNodeStepSchema
}

const SendNodeStepViewer = (props: SendNodeStepViewerProps) => {
  const { data } = props
  const nodes = useNodes()
  const targetNode = nodes.find((n) => n.id === data.nodeId)

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg bg-secondary">
      {targetNode && (
        <p className="px-4 py-2">Send node: {targetNode.data.name as string}</p>
      )}
    </div>
  )
}

export default SendNodeStepViewer
