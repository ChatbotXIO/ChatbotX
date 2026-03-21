"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { MessageCirclePlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useContactAssigneeOptions } from "@/features/users/provider/user-hook"
import { BaseStepEditor } from "../base/editor"

type AssignConversationStepEditorProps = {
  parentName: string
}

const AssignConversationStepEditor = (
  props: AssignConversationStepEditorProps,
) => {
  const t = useTranslations()
  const contactAssigneeOptions = useContactAssigneeOptions()

  return (
    <BaseStepEditor
      icon={MessageCirclePlusIcon}
      title={t("flows.actions.assignConversation")}
    >
      <ComboboxField
        label={t("fields.agent.label")}
        name={`${props.parentName}.assignedId`}
        options={contactAssigneeOptions}
      />
    </BaseStepEditor>
  )
}

export default AssignConversationStepEditor
