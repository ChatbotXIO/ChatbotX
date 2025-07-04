"use client"

import { T } from "@tolgee/react"
import { OctagonXIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"
import { TagMultiSelect } from "@/features/tags/components/tag-multi-select"

export const RemoveContactTagStepEditor = ({
  parentName,
}: { parentName: string }) => {
  return (
    <BaseStepEditor
      icon={OctagonXIcon}
      title={<T keyName="flows.StepType.RemoveContactTag" />}
    >
      <TagMultiSelect
        name={`${parentName}.tags`}
        label="Choose Tags"
        isRequired
      />
    </BaseStepEditor>
  )
}
