import {
  type OpenaiCompatiblePresetConfig,
  openaiCompatiblePresetConfigs,
} from "@chatbotx.io/ai"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import type { IntegrationOpenaiCompatibleResource } from "./schemas/resource"

export function shouldUseCustomOpenaiCompatibleModelInput(
  config: OpenaiCompatiblePresetConfig | undefined,
) {
  return Boolean(
    config?.allowCustomModelId || config?.modelOptions.length === 0,
  )
}

export function buildOpenaiCompatibleModelOptions(
  config: OpenaiCompatiblePresetConfig | undefined,
): SelectOption[] {
  return config?.modelOptions ?? []
}

export function buildOpenaiCompatibleIntegrationOptions({
  integrations,
}: {
  integrations: IntegrationOpenaiCompatibleResource[]
}): SelectOption[] {
  return integrations
    .map((integration, index) => {
      const isCustom = integration.preset === "custom"
      const presetLabel =
        openaiCompatiblePresetConfigs[integration.preset].label

      return {
        value: integration.id,
        label: isCustom
          ? `${presetLabel} - ${integration.name}`
          : integration.name,
        disabled: !integration.enabled,
        sortGroup: isCustom ? 1 : 0,
        index,
      }
    })
    .sort(
      (left, right) =>
        left.sortGroup - right.sortGroup || left.index - right.index,
    )
    .map(({ sortGroup: _sortGroup, index: _index, ...option }) => option)
}
