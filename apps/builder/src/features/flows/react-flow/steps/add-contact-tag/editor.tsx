"use client"

import { T } from "@tolgee/react"
import { TagIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"
import { TagMultiSelect } from "@/features/tags/components/tag-multi-select"

export const addContactTagStepEditor = ({
  parentName,
}: { parentName: string }) => {
  return (
    <BaseStepEditor
      icon={TagIcon}
      title={<T keyName="flows.StepType.AddContactTag" />}
    >
      <TagMultiSelect
        name={`${parentName}.tags`}
        label="Choose Tags"
        isRequired
      />
    </BaseStepEditor>
  )
}
