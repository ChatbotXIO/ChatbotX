import type {
  AIAgentModelConfig,
  AIAgentOpenaiCompatibleProviderModel,
  AIAgentProviderModels,
} from "@chatbotx.io/database/partials"
import { defaultAIModels } from "@chatbotx.io/flow-config"
import { generateText } from "ai"
import { aiTimeouts, helpTexts, MAX_SUMMARY_LENGTH } from "../../constants"
import { logger } from "../../logger"
import { aiProviders } from "../../schemas/ai-model"
import { getCachedAIIntegration } from "../cache"
import {
  createAIModelInstance,
  getOpenaiCompatibleAutoReplyIntegrationInDB,
  getOpenaiCompatibleIntegrationInDB,
} from "../factory"
import { createOpenaiCompatibleModelInstance } from "../openai-compatible"

type ProviderResult =
  | {
      provider: string
      integration: NonNullable<
        Awaited<ReturnType<typeof getCachedAIIntegration>>
      >
      kind: "legacy"
      modelId: string
    }
  | {
      provider: "openaiCompatible"
      integration: NonNullable<
        Awaited<ReturnType<typeof getOpenaiCompatibleAutoReplyIntegrationInDB>>
      >
      kind: "openaiCompatible"
      modelId: string
    }

type LegacyProviderResult = Extract<ProviderResult, { kind: "legacy" }>

export async function summarizeConversation(props: {
  workspaceId: string
  messages: Array<{ role: string; content: unknown }>
  existingSummary?: string
  preferredModels?: AIAgentProviderModels
}): Promise<string> {
  const { workspaceId, messages, existingSummary, preferredModels } = props

  // 1. Find the best available AI integration, preferring the caller's AI Agent model.
  const preferredProviderResult = await resolvePreferredProviderResult({
    preferredModels,
    workspaceId,
  })

  const legacyProviderResult = await Promise.any(
    aiProviders.options.map(async (provider): Promise<LegacyProviderResult> => {
      const integration = await getCachedAIIntegration({
        workspaceId,
        provider,
        autoReply: true,
      })
      if (!integration) {
        throw new Error(`no integration for ${provider}`)
      }
      return {
        provider,
        integration,
        kind: "legacy",
        modelId: defaultAIModels[provider as keyof typeof defaultAIModels],
      }
    }),
  ).catch(() => null)

  const providerResult: ProviderResult | null =
    preferredProviderResult ??
    legacyProviderResult ??
    (await getOpenaiCompatibleAutoReplyIntegrationInDB({ workspaceId }).then(
      (integration) =>
        integration
          ? {
              provider: "openaiCompatible" as const,
              integration,
              kind: "openaiCompatible" as const,
              modelId: integration.defaultModel,
            }
          : null,
    ))

  if (!providerResult) {
    logger.warn(
      { workspaceId },
      "[summarizer] No active AI integration found for summarization",
    )
    return existingSummary || ""
  }

  const { provider: selectedProvider } = providerResult
  const aiModel =
    providerResult.kind === "openaiCompatible"
      ? createOpenaiCompatibleModelInstance({
          integration: providerResult.integration,
          modelId: providerResult.modelId,
        })
      : createAIModelInstance({
          model: providerResult.integration,
          provider: providerResult.provider,
          modelId: providerResult.modelId,
        })

  // 2. Build the prompt
  const messagesToSummarize = messages
    .map((m) => {
      const content =
        typeof m.content === "string" ? m.content : JSON.stringify(m.content)
      return `${m.role}: ${content}`
    })
    .join("\n")

  const prompt = existingSummary
    ? [
        helpTexts.summarizer.previousSummary(existingSummary),
        helpTexts.summarizer.latestMessages,
        messagesToSummarize,
        helpTexts.summarizer.updateSummaryPrompt,
      ].join("\n\n")
    : [
        helpTexts.summarizer.conversationHistory,
        messagesToSummarize,
        helpTexts.summarizer.newSummaryPrompt,
      ].join("\n\n")

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiStep)

  try {
    const { text } = await generateText({
      model: aiModel,
      prompt,
      maxOutputTokens: 500,
      temperature: 0.3,
      abortSignal: controller.signal,
    })

    let finalSummary = text.trim()

    // 3. Compression if too long
    if (finalSummary.length > MAX_SUMMARY_LENGTH) {
      const { text: compressedText } = await generateText({
        model: aiModel,
        prompt: helpTexts.summarizer.shortenPrompt(finalSummary),
        maxOutputTokens: 400,
        temperature: 0.2,
        abortSignal: controller.signal,
      })
      finalSummary = compressedText.trim()
    }

    return finalSummary
  } catch (error) {
    logger.error(
      { error, workspaceId, provider: selectedProvider },
      "[summarizer] Failed to generate summary",
    )
    return existingSummary || ""
  } finally {
    clearTimeout(timeoutId)
  }
}

async function resolvePreferredProviderResult(props: {
  preferredModels?: AIAgentProviderModels
  workspaceId: string
}): Promise<ProviderResult | null> {
  const { preferredModels, workspaceId } = props
  if (!preferredModels?.length) {
    return null
  }

  for (const preferredModel of preferredModels) {
    if (isOpenaiCompatibleProviderModel(preferredModel)) {
      const integration = await getOpenaiCompatibleIntegrationInDB({
        workspaceId,
        id: preferredModel.integrationId,
        autoReply: true,
      })
      if (integration?.enabled) {
        return {
          provider: "openaiCompatible",
          integration,
          kind: "openaiCompatible",
          modelId: preferredModel.model,
        }
      }
      continue
    }

    const integration = await getCachedAIIntegration({
      workspaceId,
      provider: preferredModel.provider,
      autoReply: true,
    })
    if (integration) {
      return {
        provider: preferredModel.provider,
        integration,
        kind: "legacy",
        modelId: preferredModel.model,
      }
    }
  }

  return null
}

function isOpenaiCompatibleProviderModel(
  providerInfo: AIAgentModelConfig,
): providerInfo is AIAgentOpenaiCompatibleProviderModel {
  return "kind" in providerInfo && providerInfo.kind === "openaiCompatible"
}
