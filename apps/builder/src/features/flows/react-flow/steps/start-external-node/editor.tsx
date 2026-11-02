"use client"

import { ExternalLink } from "lucide-react"
import { useTranslations } from "next-intl"
import { useStepStore } from "../../stores/step-store-provider"
import { BaseStepEditor } from "../base/editor"
import { FlowNodePickerFields } from "./flow-node-picker-fields"

type StartExternalNodeStepEditorProps = {
  parentName: string
}

const StartExternalNodeStepEditor = ({
  parentName,
}: StartExternalNodeStepEditorProps) => {
  const t = useTranslations()
  const activeFlowId = useStepStore((state) => state.activeFlowId)

  return (
    <BaseStepEditor
      icon={ExternalLink}
      title={t("flows.actions.sendExternalNode")}
    >
      <FlowNodePickerFields
        disabledFlowId={activeFlowId ?? undefined}
        parentName={parentName}
      />
    </BaseStepEditor>
  )
}

export default StartExternalNodeStepEditor
