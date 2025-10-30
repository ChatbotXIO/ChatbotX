"use client"

import { MessageCirclePlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { UserSelect } from "@/features/users/user-select"
import { BaseStepEditor } from "../base/editor"

type AssignConversationStepEditorProps = {
  parentName: string
}

const AssignConversationStepEditor = (
  props: AssignConversationStepEditorProps,
) => {
  const t = useTranslations()
  return (
    <BaseStepEditor
      icon={MessageCirclePlusIcon}
      title={t("flows.actions.assignConversation")}
    >
      <UserSelect
        label={t("fields.agent.label")}
        name={`${props.parentName}.assignedId`}
      />
    </BaseStepEditor>
  )
}

export default AssignConversationStepEditor
