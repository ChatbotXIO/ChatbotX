"use client"

import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { InboxIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useConfiguredInboxTypeOptions } from "@/features/inboxes/provider/inbox-hook"
import { BaseStepEditor } from "../base/editor"

type ChooseChannelStepEditorProps = {
  parentName: string
}

const ChooseChannelStepEditor = (props: ChooseChannelStepEditorProps) => {
  const { parentName } = props
  const t = useTranslations()
  const channelOptions = useConfiguredInboxTypeOptions()

  return (
    <BaseStepEditor icon={InboxIcon} title={t("flows.actions.chooseChannel")}>
      <SelectField name={`${parentName}.channel`} options={channelOptions} />
    </BaseStepEditor>
  )
}

export default ChooseChannelStepEditor
