"use client"

import { SaveOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { BaseStepEditor } from "../base/editor"

type ClearCustomFieldStepEditorProps = {
  parentName: string
}

export const ClearCustomFieldStepEditor = (
  props: ClearCustomFieldStepEditorProps,
) => {
  const { parentName } = props
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={SaveOffIcon}
      title={t("flows.stepType.clearCustomField")}
    >
      <CustomFieldSelect label="" name={`${parentName}.customFieldId`} />
    </BaseStepEditor>
  )
}
