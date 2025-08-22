"use client"

import { ExternalLink } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { FlowSelect } from "@/features/flows/flow-select"
import { BaseStepEditor } from "../base/editor"

export const StartFlowStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()

  const { register } = useFormContext()
  const { name } = register(`${parentName}.flowId`)

  return (
    <BaseStepEditor icon={ExternalLink} title={t("flows.stepType.startFlow")}>
      <FlowSelect isRequired={true} label="" name={name} />
    </BaseStepEditor>
  )
}
