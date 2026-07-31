"use client"

import type { ConditionStepSchema } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import {
  type FieldConfig,
  formatConditionValueDisplay,
} from "@/features/contact-filter/components/contact-filter-config"
import { useContactFilterConfigs } from "@/features/contact-filter/components/use-contact-filter-configs"
import { SequenceStoreProvider } from "@/features/sequences/provider/sequence-store-context"
import { useWorkspaceId } from "@/hooks/routing"
import { StateHandle } from "../base/step-state-handles"

type ConditionStepViewerProps = {
  data: ConditionStepSchema
}

type ConditionRowData =
  ConditionStepSchema["cases"][number]["conditions"][number]

type ConditionRowProps = {
  condition: ConditionRowData
  configs: FieldConfig[]
  operatorLabelByValue: Map<string, string>
}

const ConditionRow = ({
  condition,
  configs,
  operatorLabelByValue,
}: ConditionRowProps) => {
  const t = useTranslations()

  const isCustomField = condition.field === "customField"
  const fieldConfig = configs.find((config) =>
    isCustomField && condition.customFieldId !== undefined
      ? String(config.customFieldId) === String(condition.customFieldId)
      : config.name === condition.field,
  )
  const fieldLabel =
    fieldConfig?.label ??
    (isCustomField
      ? t("fields.customField.label")
      : t(`condition.fields.${condition.field}`))
  const operatorLabel =
    operatorLabelByValue.get(condition.operator) ?? condition.operator
  const valueDisplay = formatConditionValueDisplay(
    condition.value,
    fieldConfig?.options,
  )

  return (
    <div className="rounded-md border bg-background px-2 py-1.5 text-xs leading-snug">
      <span className="font-medium">{fieldLabel}</span>{" "}
      <span className="text-muted-foreground italic">{operatorLabel}</span>
      {valueDisplay ? (
        <>
          {" "}
          <span className="font-medium">{valueDisplay}</span>
        </>
      ) : null}
    </div>
  )
}

const ConditionStepViewerContent = ({ data }: ConditionStepViewerProps) => {
  const t = useTranslations()
  const { configs, operatorLabelByValue } = useContactFilterConfigs()

  return (
    <div className="flex flex-col gap-3">
      {data.cases.map((conditionCase) => {
        const rowKeyCounts = new Map<string, number>()

        return (
          <div className="flex items-center gap-2" key={conditionCase.id}>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {conditionCase.conditions.map((condition) => {
                const baseKey = [
                  condition.field,
                  condition.customFieldId ?? "",
                  condition.operator,
                  Array.isArray(condition.value)
                    ? condition.value.join(",")
                    : (condition.value ?? ""),
                ].join(":")
                const seenCount = rowKeyCounts.get(baseKey) ?? 0
                rowKeyCounts.set(baseKey, seenCount + 1)

                return (
                  <ConditionRow
                    condition={condition}
                    configs={configs}
                    key={seenCount === 0 ? baseKey : `${baseKey}#${seenCount}`}
                    operatorLabelByValue={operatorLabelByValue}
                  />
                )
              })}
            </div>
            <StateHandle
              borderClass="border-green-500"
              fillClass="bg-green-500"
              stateId={conditionCase.id}
            />
          </div>
        )
      })}

      <div className="flex items-center gap-2">
        {/* React Flow keeps this connector on physical Position.Right. */}
        <span className="flex-1 text-right text-xs">
          {t("flows.condition.otherwise")}
        </span>
        <StateHandle
          borderClass="border-red-500"
          fillClass="bg-red-500"
          stateId={data.otherwiseId}
        />
      </div>
    </div>
  )
}

const ConditionStepViewer = ({ data }: ConditionStepViewerProps) => {
  const workspaceId = useWorkspaceId()

  return (
    <SequenceStoreProvider autoInitialize={true} workspaceId={workspaceId}>
      <ConditionStepViewerContent data={data} />
    </SequenceStoreProvider>
  )
}

export default ConditionStepViewer
