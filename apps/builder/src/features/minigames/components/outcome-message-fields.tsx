"use client"

import type { MinigameOutcomeMessage } from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@chatbotx.io/ui/components/ui/radio-group"
import { useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import {
  useFlowNodesSelectOptions,
  useFlowSelectOptions,
} from "@/features/flows/provider/flow-hook"

type OutcomeMessageFieldsProps = {
  fieldPrefix:
    | "winningMessageSettings.outcomeMessage"
    | "nonWinningMessageSettings.outcomeMessage"
  enabledLabel: string
}

export function OutcomeMessageFields({
  fieldPrefix,
  enabledLabel,
}: OutcomeMessageFieldsProps) {
  const t = useTranslations()
  const { control, setValue } = useFormContext()
  const flowOptions = useFlowSelectOptions()
  const nodeOptions = useFlowNodesSelectOptions()

  const nodeIdToFlowIdMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const flowOption of nodeOptions) {
      for (const nodeOption of flowOption.children) {
        map[nodeOption.value] = flowOption.value
      }
    }
    return map
  }, [nodeOptions])

  const outcomeMessage = useWatch({
    control,
    name: fieldPrefix,
  }) as MinigameOutcomeMessage | undefined

  const nodeId = useWatch({ control, name: `${fieldPrefix}.nodeId` })
  const currentFlowId =
    outcomeMessage?.mode === "node" ? outcomeMessage.flowId : null

  useEffect(() => {
    if (!nodeId) {
      return
    }
    const flowId = nodeIdToFlowIdMap[nodeId]
    if (flowId && flowId !== currentFlowId) {
      setValue(`${fieldPrefix}.flowId`, flowId, { shouldValidate: true })
    }
  }, [nodeId, nodeIdToFlowIdMap, currentFlowId, fieldPrefix, setValue])

  // A discriminated union on `mode` — switching modes must replace the whole
  // object (not just `.mode`) to keep the union valid, otherwise a plain
  // field-bound radio would leave stale sibling keys (e.g. `text`) behind.
  const handleModeChange = (mode: MinigameOutcomeMessage["mode"]) => {
    if (mode === outcomeMessage?.mode) {
      return
    }
    const enabled = outcomeMessage?.enabled ?? false
    let nextValue: MinigameOutcomeMessage
    if (mode === "text") {
      nextValue = { enabled, mode: "text", text: "" }
    } else if (mode === "flow") {
      nextValue = { enabled, mode: "flow", flowId: null }
    } else {
      nextValue = { enabled, mode: "node", flowId: null, nodeId: null }
    }
    setValue(fieldPrefix, nextValue, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <SwitchField label={enabledLabel} name={`${fieldPrefix}.enabled`} />

      {outcomeMessage?.enabled && (
        <div className="flex flex-col gap-4">
          <div>
            <Label>{t("minigames.outcomeMessage.mode")}</Label>
            <RadioGroup
              className="mt-2 flex flex-row gap-4"
              onValueChange={(value) =>
                handleModeChange(value as MinigameOutcomeMessage["mode"])
              }
              value={outcomeMessage?.mode}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id={`${fieldPrefix}-modeText`} value="text" />
                <Label htmlFor={`${fieldPrefix}-modeText`}>
                  {t("minigames.outcomeMessage.modeText")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id={`${fieldPrefix}-modeFlow`} value="flow" />
                <Label htmlFor={`${fieldPrefix}-modeFlow`}>
                  {t("minigames.outcomeMessage.modeFlow")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id={`${fieldPrefix}-modeNode`} value="node" />
                <Label htmlFor={`${fieldPrefix}-modeNode`}>
                  {t("fields.steps.label")}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {outcomeMessage?.mode === "text" && (
            <TextareaField
              label={t("minigames.outcomeMessage.text")}
              name={`${fieldPrefix}.text`}
            />
          )}

          {outcomeMessage?.mode === "flow" && (
            <ComboboxField
              emptyText={t("actions.noRecordFound")}
              label={t("fields.flowId.label")}
              name={`${fieldPrefix}.flowId`}
              options={flowOptions}
              placeholder={t("actions.pleaseSelect")}
            />
          )}

          {outcomeMessage?.mode === "node" && (
            <ComboboxField
              emptyText={t("actions.noRecordFound")}
              label={t("fields.steps.label")}
              name={`${fieldPrefix}.nodeId`}
              options={nodeOptions}
              placeholder={t("fields.steps.placeholder")}
            />
          )}
        </div>
      )}
    </div>
  )
}
