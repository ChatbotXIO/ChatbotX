"use client"

import { T } from "@tolgee/react"
import { ExternalLink } from "lucide-react"
import { useFormContext } from "react-hook-form"
import { FlowSelect } from "@/features/flows/flow-select"
import { BaseStepEditor } from "../base/editor"

export const StartFlowStepEditor = ({ parentName }: { parentName: string }) => {
  const { register } = useFormContext()
  const { name } = register(`${parentName}.flowId`)

  return (
    <BaseStepEditor
      icon={ExternalLink}
      title={<T keyName="flows.StepType.StartFlow" />}
    >
      <FlowSelect isRequired={true} label="" name={name} />
    </BaseStepEditor>
  )
}
