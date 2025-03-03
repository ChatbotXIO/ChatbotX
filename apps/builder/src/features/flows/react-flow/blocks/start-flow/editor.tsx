"use client"

import { FlowSelect } from "@/features/flows/flow-select"
import { T } from "@tolgee/react"
import { ExternalLink } from "lucide-react"
import { useFormContext } from "react-hook-form"

export const StartFlowBlockEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const { register } = useFormContext()
  const { name } = register(`${parentName}.flowId`)

  return (
    <>
      <div className="flex items-center gap-2 p-2 font-bold text-center break-all">
        <ExternalLink size={20} className="text-yellow-500" />
        <T keyName="flows.ActionType.StartFlow" />
      </div>
      <FlowSelect name={name} label="" isRequired={true} />
    </>
  )
}
