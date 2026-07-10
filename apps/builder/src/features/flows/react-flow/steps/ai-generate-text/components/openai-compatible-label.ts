import type {
  AIAnalyzeImageSchema,
  AIExtractDataSchema,
  AIGenerateTextAgentSchema,
  AIGenerateTextSchema,
} from "@chatbotx.io/flow-config"
import type { IntegrationOpenaiCompatibleResource } from "@/features/integration-openai-compatible/schemas/resource"

type OpenaiCompatibleStep =
  | AIGenerateTextSchema
  | AIGenerateTextAgentSchema
  | AIAnalyzeImageSchema
  | AIExtractDataSchema

export function getOpenaiCompatibleStepProviderLabel({
  fallback,
  integrations,
  step,
}: {
  fallback: string
  integrations: IntegrationOpenaiCompatibleResource[]
  step: OpenaiCompatibleStep
}) {
  if (step.provider !== "openaiCompatible") {
    return fallback
  }

  return (
    integrations.find((integration) => integration.id === step.integrationId)
      ?.name ?? fallback
  )
}
