import type {
  AIAnalyzeImageSchema,
  AIExtractDataSchema,
  AIGenerateTextSchema,
} from "@chatbotx.io/flow-config"
import type { IntegrationOpenaiCompatibleResource } from "@/features/integration-openai-compatible/schemas/resource"

type OpenaiCompatibleStep =
  | AIGenerateTextSchema
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
