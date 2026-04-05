"use client"

import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Layers2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useSequenceOptions } from "@/features/sequences/provider/sequence-hook"
import { SequenceStoreProvider } from "@/features/sequences/provider/sequence-store-context"
import { useWorkspaceId } from "@/hooks/routing"
import { BaseStepEditor } from "../base/editor"

const SubscribeSequenceSelector = ({ parentName }: { parentName: string }) => {
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
      placeholder={t("fields.search.placeholder")}
    />
  )
}

const SubscribeSequenceStepEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  return (
    <SequenceStoreProvider autoInitialize={true} workspaceId={workspaceId}>
      <BaseStepEditor
        icon={Layers2Icon}
        title={t("flows.actions.subscribeSequence")}
      >
        <SubscribeSequenceSelector parentName={parentName} />
      </BaseStepEditor>
    </SequenceStoreProvider>
  )
}

export default SubscribeSequenceStepEditor
