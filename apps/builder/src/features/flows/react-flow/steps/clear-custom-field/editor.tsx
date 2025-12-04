"use client"

import { SaveOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { BaseStepEditor } from "../base/editor"

type ClearCustomFieldStepEditorProps = {
  parentName: string
}

const ClearCustomFieldStepEditor = (props: ClearCustomFieldStepEditorProps) => {
  const { parentName } = props
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={SaveOffIcon}
      title={t("flows.actions.clearCustomField")}
    >
      <CustomFieldSelect
        includeReserved={false}
        name={`${parentName}.inputCfId`}
      />
    </BaseStepEditor>
  )
}

export default ClearCustomFieldStepEditor
