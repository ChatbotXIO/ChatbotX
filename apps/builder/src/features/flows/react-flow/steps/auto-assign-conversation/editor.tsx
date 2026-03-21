"use client"

import { AutoAssignConversationRule } from "@chatbotx.io/flow-config"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { MessageCirclePlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useContactAssigneeMultiSelectOptions } from "@/features/users/provider/user-hook"
import { BaseStepEditor } from "../base/editor"

const AutoAssignConversationStepEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()
  const contactAssigneeOptions = useContactAssigneeMultiSelectOptions()

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
        <MultiSelectField
          label={t("autoAssignConversation.users.label")}
          name={`${parentName}.assignedIds`}
          options={contactAssigneeOptions}
        />
      </div>
    </BaseStepEditor>
  )
}

export default AutoAssignConversationStepEditor
