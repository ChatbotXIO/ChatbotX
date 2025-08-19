"use client"

import { useNodes } from "@xyflow/react"
import { useFormContext } from "react-hook-form"

type SendFlowNodeStepEditorProps = {
  parentName: string
}

const SendFlowNodeStepEditor = (props: SendFlowNodeStepEditorProps) => {
  const { parentName } = props

  const nodes = useNodes()

  // trying to get target node ID
  const { getValues } = useFormContext()
  const targetNodeId = getValues(`${parentName}.nodeId`)
  const targetNode = nodes.find((n) => n.id === targetNodeId)

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg">
      <div className="bg-slate-200 px-3 py-2">
        <div>{(targetNode?.data?.name as string) ?? ""}</div>
      </div>
    </div>
  )
}

export default SendFlowNodeStepEditor
