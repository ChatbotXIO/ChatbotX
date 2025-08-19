"use client"

import { T } from "@tolgee/react"
import { TagIcon } from "lucide-react"
import { TagMultiSelect } from "@/features/tags/components/tag-multi-select"
import { BaseStepEditor } from "../base/editor"

export const addContactTagStepEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  return (
    <BaseStepEditor
      icon={TagIcon}
      title={<T keyName="flows.StepType.AddContactTag" />}
    >
      <TagMultiSelect
        isRequired
        label="Choose Tags"
        name={`${parentName}.tags`}
      />
    </BaseStepEditor>
  )
}
