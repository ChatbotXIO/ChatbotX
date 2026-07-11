import { openaiCompatiblePresetConfigs } from "@chatbotx.io/ai"
import type { AIAgentProviderModels } from "@chatbotx.io/database/partials"
import { sortOpenaiCompatibleIntegrations } from "@/features/integration-openai-compatible/model-options"
import type { IntegrationOpenaiCompatibleResource } from "@/features/integration-openai-compatible/schemas/resource"

export {
  getOpenaiCompatibleIntegrationLabel,
  shouldUseCustomOpenaiCompatibleModelInput,
} from "@/features/integration-openai-compatible/model-options"

type OpenaiCompatibleAgentModel = Extract<
  AIAgentProviderModels[number],
  { kind: "openaiCompatible" }
>

function isOpenaiCompatibleAgentModel(
  model: AIAgentProviderModels[number],
): model is OpenaiCompatibleAgentModel {
  return "kind" in model && model.kind === "openaiCompatible"
}

export function buildOpenaiCompatibleAgentModels({
  integrations,
  storedModels = [],
}: {
  integrations: IntegrationOpenaiCompatibleResource[]
  storedModels?: AIAgentProviderModels
}) {
  const storedByIntegrationId = new Map(
    storedModels
      .filter(isOpenaiCompatibleAgentModel)
      .map((model) => [model.integrationId, model.model]),
  )

  return sortOpenaiCompatibleIntegrations(integrations).flatMap(
    (integration) => {
      const storedModel = storedByIntegrationId.get(integration.id)
      if (!(integration.enabled || storedModel)) {
        return []
      }

      const presetConfig =
        openaiCompatiblePresetConfigs[
          integration.preset as keyof typeof openaiCompatiblePresetConfigs
        ]

      const model =
        storedModel ?? integration.defaultModel ?? presetConfig?.defaultModel

      if (!model) {
        return []
      }

      return [
        {
          kind: "openaiCompatible" as const,
          integrationId: integration.id,
          model,
        },
      ]
    },
  )
}
