"use client"

import { AutoAssignConversationRule } from "@aha.chat/flow-config"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { T } from "@tolgee/react"
import { MessageCirclePlusIcon } from "lucide-react"
import { UserMultipleSelect } from "@/features/users/user-select"
import { BaseStepEditor } from "../base/editor"

type AutoAssignConversationStepEditorProps = {
  parentName: string
}

const AutoAssignConversationStepEditor = (
  props: AutoAssignConversationStepEditorProps,
) => {
  const { parentName } = props

  const ruleOptions = [
    {
      label: "Equal conversation distribution (All time)",
      value: AutoAssignConversationRule.ALL_TIME,
    },
    {
      label: "Equal conversation distribution (Last Hour)",
      value: AutoAssignConversationRule.LAST_HOUR,
    },
    {
      label: "Equal conversation distribution (Last 8 hours)",
      value: AutoAssignConversationRule.LAST_8HOURS,
    },
    {
      label: "Equal conversation distribution (Last 24 hours)",
      value: AutoAssignConversationRule.LAST_24HOURS,
    },
  ]

  return (
    <BaseStepEditor
      icon={MessageCirclePlusIcon}
      title={<T keyName="flows.StepType.AutoAssignConversation" />}
    >
      <div className="flex w-[243px] flex-wrap gap-1.5 overflow-hidden">
        <UserMultipleSelect name={`${parentName}.userIds`} />
        <SelectField name={`${parentName}.rule`} options={ruleOptions} />
      </div>
    </BaseStepEditor>
  )
}

export { AutoAssignConversationStepEditor }
