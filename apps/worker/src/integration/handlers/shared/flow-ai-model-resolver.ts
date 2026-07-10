import type { AIProvider } from "@chatbotx.io/ai"
import {
  aiIntegrationService,
  createAIModelInstance,
  createOpenaiCompatibleModelInstance,
} from "@chatbotx.io/ai/server"
import { integrationOpenaiCompatibleService } from "@chatbotx.io/business"
import type { IntegrationOpenaiCompatibleModel } from "@chatbotx.io/database/types"
import type { LanguageModel } from "ai"

type NativeFlowAIProvider = AIProvider
type OpenaiCompatibleFlowAIProvider = "openaiCompatible"

export type FlowAIModelConfig = {
  workspaceId: string
  conversationId?: string
  provider: NativeFlowAIProvider | OpenaiCompatibleFlowAIProvider
  modelId: string
  integrationId?: string
}

export type ResolveFlowAIModelResult =
  | {
      ok: true
      model: LanguageModel
      integration?: IntegrationOpenaiCompatibleModel
    }
  | {
      ok: false
      reason:
        | "ai_integration_missing"
        | "openai_compatible_integration_missing_or_disabled"
      message: string
    }

export async function resolveFlowAIModel(
  props: FlowAIModelConfig,
): Promise<ResolveFlowAIModelResult> {
  if (props.provider === "openaiCompatible") {
    if (!props.integrationId) {
      return {
        ok: false,
        reason: "openai_compatible_integration_missing_or_disabled",
        message: "OpenAI-compatible integration is not configured",
      }
    }

    const integration =
      await integrationOpenaiCompatibleService.findByWorkspaceIdAndId({
        workspaceId: props.workspaceId,
        id: props.integrationId,
      })

    if (!integration?.enabled) {
      return {
        ok: false,
        reason: "openai_compatible_integration_missing_or_disabled",
        message: "OpenAI-compatible integration is missing or disabled",
      }
    }

    return {
      ok: true,
      integration,
      model: createOpenaiCompatibleModelInstance({
        integration,
        modelId: props.modelId,
      }),
    }
  }

  const aiConfig = await aiIntegrationService.findBy({
    workspaceId: props.workspaceId,
    provider: props.provider,
  })

  if (!aiConfig) {
    return {
      ok: false,
      reason: "ai_integration_missing",
      message: `AI integration not found for provider ${props.provider}`,
    }
  }

  return {
    ok: true,
    model: createAIModelInstance({
      model: aiConfig,
      provider: props.provider,
      modelId: props.modelId,
      traceId: props.conversationId,
    }),
  }
}
