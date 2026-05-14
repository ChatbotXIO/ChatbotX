"use client"

import type { FlowNode } from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { ExternalLink } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
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
  const flowOptions = useFlowSelectOptions()
  const { flows } = useFlowStore((state) => state)
  const { activeFlowId } = useStepStore((state) => state)
  const { control } = useFormContext()
  const currentFlowId = useWatch({ control, name: `${parentName}.flowId` })

  const nodeOptions = useMemo(() => {
    if (!currentFlowId) {
      return []
    }
    const targetFlow = flows.find((f) => f.id === currentFlowId)
    if (!targetFlow) {
      return []
    }
    return (
      (targetFlow.flowVersions?.[0]?.nodes || []) as unknown as FlowNode[]
    ).map((node) => ({
      value: node.id,
      label: node.data.name,
    }))
  }, [currentFlowId, flows])

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
