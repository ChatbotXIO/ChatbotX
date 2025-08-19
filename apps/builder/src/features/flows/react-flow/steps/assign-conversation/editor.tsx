"use client"

import { T } from "@tolgee/react"
import { MessageCirclePlusIcon } from "lucide-react"
import { UserSelect } from "@/features/users/user-select"
import { BaseStepEditor } from "../base/editor"

type AssignConversationStepEditorProps = {
  parentName: string
}

const AssignConversationStepEditor = (
  props: AssignConversationStepEditorProps,
) => {
  return (
    <BaseStepEditor
      icon={MessageCirclePlusIcon}
      title={<T keyName="flows.StepType.AssignConversation" />}
    >
      <UserSelect
        label="Choose agent"
        name={`${props.parentName}.assignedId`}
      />
    </BaseStepEditor>
  )
}

export { AssignConversationStepEditor }
