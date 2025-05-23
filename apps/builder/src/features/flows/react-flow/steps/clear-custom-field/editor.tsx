"use client"

import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { T } from "@tolgee/react"

export const ClearCustomFieldStepEditor = ({
  parentName,
}: { parentName: string }) => {
  return (
    <div className="rounded-lg border-2 border-dashed p-4 text-sm flex flex-col gap-2">
      <div>
        <T keyName="flows.StepType.ClearCustomField" />
      </div>
      <CustomFieldSelect name={`${parentName}.customFieldId`} label="" />
    </div>
  )
}
