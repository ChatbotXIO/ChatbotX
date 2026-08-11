"use client"

import { openaiCompatiblePresetConfigs } from "@chatbotx.io/ai"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import {
  buildOpenaiCompatibleIntegrationOptions,
  buildOpenaiCompatibleModelOptions,
  shouldUseCustomOpenaiCompatibleModelInput,
} from "@/features/integration-openai-compatible/model-options"
import { useFlowTemplate } from "../../../stores/flow-template-store-provider"

type OpenaiCompatibleModelFieldsProps = {
  integrationName?: string
  kind?: "default" | "analyzeImage"
  modelName?: string
}

export function OpenaiCompatibleModelFields({
  integrationName = "integrationId",
  kind = "default",
  modelName = "model",
}: OpenaiCompatibleModelFieldsProps) {
  const t = useTranslations()
  const { control, setValue } = useFormContext()
  const integrations = useFlowTemplate(
    (store) => store.openaiCompatibleIntegrations,
  )
  const integrationId = useWatch({ control, name: integrationName })

  const integrationOptions = useMemo(
    () =>
      buildOpenaiCompatibleIntegrationOptions({
        integrations,
      }),
    [integrations],
  )

  const selectedIntegration = integrations.find(
    (integration) => integration.id === integrationId,
  )
  const presetConfig = selectedIntegration
    ? openaiCompatiblePresetConfigs[selectedIntegration.preset]
    : undefined
  const modelOptions = buildOpenaiCompatibleModelOptions(presetConfig, kind)
  const useCustomModelInput = shouldUseCustomOpenaiCompatibleModelInput(
    presetConfig,
    kind,
  )

  if (integrations.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
        {t("flows.openaiCompatible.empty")}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SelectField
        allowClear
        clearLabel={t("messages.none")}
        label={t("flows.openaiCompatible.integration")}
        name={integrationName}
        options={integrationOptions}
        required
        triggerValueChange={() => setValue(modelName, "")}
      />

      {useCustomModelInput ? (
        <InputField
          label={t("fields.model.label")}
          name={modelName}
          placeholder={selectedIntegration?.defaultModel}
          required
        />
      ) : (
        <ComboboxField
          label={t("fields.model.label")}
          name={modelName}
          options={modelOptions}
          required
        />
      )}
    </div>
  )
}
