"use client"

import type { FlowNode } from "@aha.chat/flow-config"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { ExternalLink } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { useFlowStore } from "@/features/flows/provider/flow-store-context"
import { useStepStore } from "../../stores/step-store-provider"
import { BaseStepEditor } from "../base/editor"

const StartExternalNodeStepEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()
  const [nodeOptions, setNodeOptions] = useState<
    { value: string; label: string }[]
  >([])

  const flowOptions = useFlowSelectOptions()
  const { flows } = useFlowStore((state) => state)
  const { activeFlowId } = useStepStore((state) => state)

  const onFlowChange = (value?: string) => {
    if (!value) {
      setNodeOptions([])
      return
    }

    const targetFlow = flows.find((f) => f.id === value)
    if (targetFlow) {
      setNodeOptions(
        (
          (targetFlow.flowVersions?.[0]?.nodes || []) as unknown as FlowNode[]
        ).map((node) => ({
          value: node.id,
          label: node.data.name,
        })),
      )
    } else {
      setNodeOptions([])
    }
  }

  return (
    <BaseStepEditor
      icon={ExternalLink}
      title={t("flows.actions.sendExternalNode")}
    >
      <div className="flex flex-col gap-4">
        <ComboboxField
          disableValues={activeFlowId ? [activeFlowId] : undefined}
          label={t("fields.flow.label")}
          name={`${parentName}.flowId`}
          options={flowOptions}
          required={true}
          triggerValueChange={onFlowChange}
        />

        <ComboboxField
          label={t("fields.node.label")}
          name={`${parentName}.nodeId`}
          options={nodeOptions}
          required={true}
        />
      </div>
    </BaseStepEditor>
  )
}

export default StartExternalNodeStepEditor
