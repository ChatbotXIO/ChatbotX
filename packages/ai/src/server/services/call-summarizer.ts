import { generateObject } from "ai"
import { z } from "zod"
import { aiTimeouts } from "../../constants"
import { logger } from "../../logger"
import { type AIProvider, aiProviders } from "../../schemas/ai-model"
import { createAIModelInstance, getAIIntegrationInDB } from "../factory"

/**
 * WhatsApp calling AI Summary — on-demand, from the
 * workspace's already-connected legacy AI integrations (OpenAI, Gemini,
 * Claude, DeepSeek, OpenRouter). Deliberately excludes `openaiCompatible`
 * (no fixed provider label to show in the picker) and never touches
 * auto-reply scoping — a connection used only for auto-reply is still a
 * valid summarization provider.
 */

export type CallSummaryProviderOption = {
  /** The connected integration row's id — stable per workspace+provider. */
  id: string
  provider: AIProvider
  label: string
}

const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  claude: "Claude",
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
}

/** Mirrors `defaultAIModels` (`packages/flow-config/src/steps/ai-generate-text.ts`) — kept as an independent copy since this feature has no flow-step context to read a model choice from. */
const DEFAULT_SUMMARY_MODELS: Record<AIProvider, string> = {
  openai: "gpt-5.4-mini",
  gemini: "gemini-3.5-flash",
  claude: "claude-sonnet-4-6",
  deepseek: "deepseek-v4-flash",
  openrouter: "openai/gpt-5.4-mini",
}

export async function listConnectedCallSummaryProviders(
  workspaceId: string,
): Promise<CallSummaryProviderOption[]> {
  const results = await Promise.all(
    aiProviders.options.map(async (provider) => {
      const integration = await getAIIntegrationInDB({ workspaceId, provider })
      return integration
        ? { id: integration.id, provider, label: PROVIDER_LABELS[provider] }
        : null
    }),
  )
  return results.filter(
    (result): result is CallSummaryProviderOption => result !== null,
  )
}

export type CallSummaryResult = {
  summary: string
  keyPoints?: string[]
  actionItems?: string[]
}

const callSummarySchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()).optional(),
  actionItems: z.array(z.string()).optional(),
})

/** Thrown when the caller-selected provider is not (or no longer) connected. */
export class CallSummaryProviderNotConnectedError extends Error {
  constructor(provider: string) {
    super(`call-summary-provider-not-connected: ${provider}`)
    this.name = "CallSummaryProviderNotConnectedError"
  }
}

export async function generateCallSummary(props: {
  workspaceId: string
  provider: AIProvider
  transcriptText: string
}): Promise<CallSummaryResult> {
  const { workspaceId, provider, transcriptText } = props
  const integration = await getAIIntegrationInDB({ workspaceId, provider })
  if (!integration) {
    throw new CallSummaryProviderNotConnectedError(provider)
  }

  const aiModel = createAIModelInstance({
    model: integration,
    provider,
    modelId: DEFAULT_SUMMARY_MODELS[provider],
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiStep)

  try {
    const { object } = await generateObject({
      model: aiModel,
      schema: callSummarySchema,
      prompt: [
        "Summarize the following phone call transcript for a customer support agent.",
        "Provide a concise summary, a short list of key discussion points, and any concrete action items.",
        "If the transcript has no clear action items, omit that field rather than inventing one.",
        "",
        transcriptText,
      ].join("\n"),
      abortSignal: controller.signal,
    })
    return object
  } catch (error) {
    logger.error(
      { error, workspaceId, provider },
      "[call-summarizer] Failed to generate call summary",
    )
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
