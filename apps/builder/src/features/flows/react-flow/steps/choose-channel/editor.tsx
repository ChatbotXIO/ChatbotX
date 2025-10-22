"use client"

import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { InboxIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useStepStore } from "../../stores/step-store-provider"
import { BaseStepEditor } from "../base/editor"

type ChooseChannelStepEditorProps = {
  parentName: string
}

const ChooseChannelStepEditor = (props: ChooseChannelStepEditorProps) => {
  const { parentName } = props
  const t = useTranslations()
  const channelOptions = useStepStore((state) => state.channelOptions)

  return (
    <BaseStepEditor icon={InboxIcon} title={t("flows.actions.chooseChannel")}>
      <SelectField name={`${parentName}.channel`} options={channelOptions} />
    </BaseStepEditor>
  )
}

export default ChooseChannelStepEditor
