"use client"

import { AutoAssignConversationRule } from "@aha.chat/flow-config"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { MessageCirclePlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { UserMultipleSelect } from "@/features/users/user-select"
import { BaseStepEditor } from "../base/editor"

const AutoAssignConversationStepEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()

  const ruleOptions = [
    {
      label: t("autoAssignConversation.rule.allTime"),
      value: AutoAssignConversationRule.ALL_TIME,
    },
    {
      label: t("autoAssignConversation.rule.lastHour"),
      value: AutoAssignConversationRule.LAST_HOUR,
    },
    {
      label: t("autoAssignConversation.rule.last8Hours"),
      value: AutoAssignConversationRule.LAST_8HOURS,
    },
    {
      label: t("autoAssignConversation.rule.last24Hours"),
      value: AutoAssignConversationRule.LAST_24HOURS,
    },
  ]

  return (
    <BaseStepEditor
      icon={MessageCirclePlusIcon}
      title={t("flows.actions.autoAssignConversation")}
    >
      <div className="flex w-[243px] flex-wrap gap-1.5 overflow-hidden">
        <SelectField
          label={t("autoAssignConversation.rule.label")}
          name={`${parentName}.rule`}
          options={ruleOptions}
        />
        <UserMultipleSelect
          label={t("autoAssignConversation.users.label")}
          name={`${parentName}.userIds`}
        />
      </div>
    </BaseStepEditor>
  )
}

export default AutoAssignConversationStepEditor
