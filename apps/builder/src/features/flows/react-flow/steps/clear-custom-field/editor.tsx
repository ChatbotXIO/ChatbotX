"use client"

import { T } from "@tolgee/react"
import { SaveOffIcon } from "lucide-react"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { BaseStepEditor } from "../base/editor"

type ClearCustomFieldStepEditorProps = {
  parentName: string
}

export const ClearCustomFieldStepEditor = (
  props: ClearCustomFieldStepEditorProps,
) => {
  const { parentName } = props

  return (
    <BaseStepEditor
      icon={SaveOffIcon}
      title={<T keyName="flows.StepType.ClearCustomField" />}
    >
      <CustomFieldSelect label="" name={`${parentName}.customFieldId`} />
    </BaseStepEditor>
  )
}
