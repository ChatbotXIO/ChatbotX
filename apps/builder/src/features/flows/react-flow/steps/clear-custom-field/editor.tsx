"use client"

import { T } from "@tolgee/react"
import { SaveOffIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"

export const ClearCustomFieldStepEditor = ({
  parentName,
}: { parentName: string }) => {
  return (
    <BaseStepEditor
      icon={SaveOffIcon}
      title={<T keyName="flows.StepType.ClearCustomField" />}
    >
      <CustomFieldSelect name={`${parentName}.customFieldId`} label="" />
    </BaseStepEditor>
  )
}
