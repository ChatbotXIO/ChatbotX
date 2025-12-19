"use client"

import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { ExternalLink } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { useStepStore } from "../../stores/step-store-provider"
import { BaseStepEditor } from "../base/editor"

const SendExternalFlowStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()

  const { register } = useFormContext()
  const { name } = register(`${parentName}.flowId`)
  const flowOptions = useFlowSelectOptions()
  const { activeFlowId } = useStepStore((state) => state)

  return (
    <BaseStepEditor
      icon={ExternalLink}
      title={t("flows.actions.sendExternalFlow")}
    >
      <ComboboxField
        disableValues={activeFlowId ? [activeFlowId] : undefined}
        name={name}
        options={flowOptions}
        required={true}
      />
    </BaseStepEditor>
  )
}

export default SendExternalFlowStepEditor
