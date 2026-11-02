"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import {
  getFlowNodesOptions,
  useFlowSelectOptions,
  useFlows,
} from "@/features/flows/provider/flow-hook"
import { useWorkspaceId } from "@/hooks/routing"

type FlowNodePickerFieldsProps = {
  /** Form path of the object holding `flowId` and `nodeId`. */
  parentName: string
  /** A flow that cannot be picked (the flow being edited, to avoid a loop). */
  disabledFlowId?: string
}

/** The flow + node pair shared by the Start External Node step and trigger action. */
export const FlowNodePickerFields = ({
  parentName,
  disabledFlowId,
}: FlowNodePickerFieldsProps) => {
  const t = useTranslations()
  const flowOptions = useFlowSelectOptions()
  const { data: flows = [] } = useFlows(useWorkspaceId())
  const { control, setValue } = useFormContext()

  const flowIdField = `${parentName}.flowId`
  const nodeIdField = `${parentName}.nodeId`

  const currentFlowId = useWatch({ control, name: flowIdField })

  const nodeOptions = useMemo(() => {
    const targetFlow = currentFlowId
      ? flows.find((flow) => flow.id === currentFlowId)
      : undefined
    return targetFlow ? getFlowNodesOptions(targetFlow.flowVersions) : []
  }, [currentFlowId, flows])

  return (
    <div className="flex flex-col gap-4">
      <ComboboxField
        disableValues={disabledFlowId ? [disabledFlowId] : undefined}
        emptyText={t("actions.noRecordFound")}
        label={t("fields.flow.label")}
        name={flowIdField}
        options={flowOptions}
        placeholder={t("actions.pleaseSelect")}
        required={true}
        triggerValueChange={() => setValue(nodeIdField, "")}
      />

      <ComboboxField
        emptyText={t("actions.noRecordFound")}
        label={t("fields.node.label")}
        name={nodeIdField}
        options={nodeOptions}
        placeholder={t("actions.pleaseSelect")}
        required={true}
      />
    </div>
  )
}
