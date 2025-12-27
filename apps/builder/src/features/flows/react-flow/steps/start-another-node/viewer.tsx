"use client"

import type { StartAnotherNodeStepSchema } from "@aha.chat/flow-config"
import { useReactFlow } from "@xyflow/react"
import { useMemo } from "react"

type SendNodeStepViewerProps = {
  data: StartAnotherNodeStepSchema
}

const SendNodeStepViewer = (props: SendNodeStepViewerProps) => {
  const { data } = props

  const { getNodes } = useReactFlow()
  const targetNode = useMemo(() => {
    const nodes = getNodes()
    return nodes.find((n) => n.id === data.nodeId)
  }, [getNodes, data.nodeId])

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg bg-secondary">
      {targetNode && (
        <p className="px-4 py-2">Send node: {targetNode.data.name as string}</p>
      )}
    </div>
  )
}

export default SendNodeStepViewer
