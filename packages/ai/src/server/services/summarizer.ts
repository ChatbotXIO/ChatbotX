import type {
  IntegrationGeminiModel,
  IntegrationOpenAIModel,
} from "@chatbotx.io/database/types"
import { defaultAIModels } from "@chatbotx.io/flow-config"
import { generateText } from "ai"
import { helpTexts, MAX_SUMMARY_LENGTH } from "../../constants"
import { logger } from "../../logger"
import { aiProviders } from "../../schemas/ai-model"
import { getCachedAIIntegration } from "../cache"
import { createAIModelInstance } from "../factory"

export async function summarizeConversation(props: {
  workspaceId: string
  messages: Array<{ role: string; content: unknown }>
  existingSummary?: string
}): Promise<string> {
  const { workspaceId, messages, existingSummary } = props

  // 1. Find the best available AI integration
  let selectedProvider: string | undefined
  let selectedModel: IntegrationOpenAIModel | IntegrationGeminiModel | undefined

  for (const provider of aiProviders.options) {
    const integration = await getCachedAIIntegration({
      workspaceId,
      provider,
      autoReply: true,
    })

    if (integration) {
      selectedProvider = provider
      selectedModel = integration
      break
    }
  }

  if (!(selectedProvider && selectedModel)) {
    logger.warn(
      { workspaceId },
      "[summarizer] No active AI integration found for summarization",
    )
    return existingSummary || ""
  }

  const modelId =
    defaultAIModels[selectedProvider as keyof typeof defaultAIModels]
  const aiModel = createAIModelInstance({
    model: selectedModel,
    provider: selectedProvider,
    modelId,
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

  try {
    const { text } = await generateText({
      model: aiModel,
      prompt,
      maxOutputTokens: 500,
      temperature: 0.3,
    })

    let finalSummary = text.trim()

    // 3. Compression if too long
    if (finalSummary.length > MAX_SUMMARY_LENGTH) {
      const { text: compressedText } = await generateText({
        model: aiModel,
        prompt: helpTexts.summarizer.shortenPrompt(finalSummary),
        maxOutputTokens: 400,
        temperature: 0.2,
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
  }
}
