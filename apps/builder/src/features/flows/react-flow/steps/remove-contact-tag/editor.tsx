"use client"

import { T } from "@tolgee/react"
import { OctagonXIcon } from "lucide-react"
import { TagMultiSelect } from "@/features/tags/components/tag-multi-select"
import { BaseStepEditor } from "../base/editor"

type RemoveContactTagStepEditorProps = {
  parentName: string
}

export const RemoveContactTagStepEditor = (
  props: RemoveContactTagStepEditorProps,
) => {
  const { parentName } = props

  return (
    <BaseStepEditor
      icon={OctagonXIcon}
      title={<T keyName="flows.StepType.RemoveContactTag" />}
    >
      <TagMultiSelect
        isRequired
        label="Choose Tags"
        name={`${parentName}.tags`}
      />
    </BaseStepEditor>
  )
}
