"use client"

import { useNodes } from "@xyflow/react"
import { useFormContext } from "react-hook-form"

const SendMessageNodeStepEditor = ({ parentName }: { parentName: string }) => {
  const nodes = useNodes()

  // trying to get target node ID
  const { getValues } = useFormContext()
  const targetNodeId = getValues(`${parentName}.nodeId`)
  const targetNode = nodes.find((n) => n.id === targetNodeId)

  return (
    <div className="items-center rounded-lg overflow-hidden justify-center">
      <div className="bg-slate-200 px-3 py-2">
        <div>{(targetNode?.data?.name as string) ?? ""}</div>
      </div>
    </div>
  )
}

export default SendMessageNodeStepEditor
