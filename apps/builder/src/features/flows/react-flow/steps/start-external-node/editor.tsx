"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { ExternalLink } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import {
  getFlowNodesOptions,
  useFlowSelectOptions,
} from "@/features/flows/provider/flow-hook"
import { useFlowStore } from "@/features/flows/provider/flow-store-context"
import { useStepStore } from "../../stores/step-store-provider"
import { BaseStepEditor } from "../base/editor"

type StartExternalNodeStepEditorProps = {
  parentName: string
}

const StartExternalNodeStepEditor = (
  props: StartExternalNodeStepEditorProps,
) => {
  const { parentName } = props

  const t = useTranslations()
  const flowOptions = useFlowSelectOptions()
  const flows = useFlowStore((state) => state.flows)
  const activeFlowId = useStepStore((state) => state.activeFlowId)
  const { control } = useFormContext()

  const flowIdField = `${parentName}.flowId`
  const nodeIdField = `${parentName}.nodeId`

  const currentFlowId = useWatch({ control, name: flowIdField })

  const nodeOptions = useMemo(() => {
    if (!currentFlowId) {
      return []
    }
    const targetFlow = flows.find((f) => f.id === currentFlowId)
    if (!targetFlow) {
      return []
    }
    return getFlowNodesOptions(targetFlow.flowVersions)
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
          name={flowIdField}
          options={flowOptions}
          required={true}
        />

        <ComboboxField
          label={t("fields.node.label")}
          name={nodeIdField}
          options={nodeOptions}
          required={true}
        />
      </div>
    </BaseStepEditor>
  )
}

export default StartExternalNodeStepEditor
