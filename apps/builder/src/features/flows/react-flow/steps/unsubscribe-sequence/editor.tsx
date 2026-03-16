"use client"

import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { Layers2Icon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useSequenceOptions } from "@/features/sequences/provider/sequence-hook"
import { SequenceStoreProvider } from "@/features/sequences/provider/sequence-store-context"
import { BaseStepEditor } from "../base/editor"

const UnsubscribeSequenceSelector = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()
  const sequenceOptions = useSequenceOptions()

  const sequenceSelectOptions = sequenceOptions.map((sequence) => ({
    label: sequence.name,
    value: sequence.id,
  }))

  return (
    <SelectField
      className="mt-5"
      name={`${parentName}.sequenceId`}
      options={sequenceSelectOptions}
      placeholder={t("sequences.field.placeholder")}
    />
  )
}

const UnsubscribeSequenceStepEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()

  return (
    <SequenceStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      <BaseStepEditor
        icon={Layers2Icon}
        title={t("flows.actions.unsubscribeSequence")}
      >
        <UnsubscribeSequenceSelector parentName={parentName} />
      </BaseStepEditor>
    </SequenceStoreProvider>
  )
}

export default UnsubscribeSequenceStepEditor
