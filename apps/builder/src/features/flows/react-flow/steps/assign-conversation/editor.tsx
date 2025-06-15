"use client"

import { UserSelect } from "@/features/users/user-select"
import { T } from "@tolgee/react"
import { MessageCirclePlusIcon } from "lucide-react"
import { BaseStepEditor } from "../base/editor"

const AssignConversationStepEditor = ({
  parentName,
}: { parentName: string }) => {
  return (
    <BaseStepEditor
      icon={MessageCirclePlusIcon}
      title={<T keyName="flows.StepType.AssignConversation" />}
    >
      <UserSelect name={`${parentName}.assignedId`} label="Choose agent" />
    </BaseStepEditor>
  )
}

export { AssignConversationStepEditor }
