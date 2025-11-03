"use client"

import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { ExternalLink } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { useStepStore } from "../../stores/step-store-provider"
import { BaseStepEditor } from "../base/editor"

const SendExternalFlowStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()

  const { register } = useFormContext()
  const { name } = register(`${parentName}.flowId`)
  const { flowOptions } = useStepStore((state) => state)

  return (
    <BaseStepEditor
      icon={ExternalLink}
      title={t("flows.actions.sendExternalFlow")}
    >
      <SelectField name={name} options={flowOptions} required={true} />
    </BaseStepEditor>
  )
}

export default SendExternalFlowStepEditor
