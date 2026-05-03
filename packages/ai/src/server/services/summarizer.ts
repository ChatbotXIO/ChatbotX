import type {
  IntegrationGeminiModel,
  IntegrationOpenAIModel,
} from "@chatbotx.io/database/types"
import { defaultAIModels } from "@chatbotx.io/flow-config"
import { generateText } from "ai"
import { logger } from "../../logger"
import { getCachedAIIntegration } from "../cache"
import { createAIModelInstance } from "../factory"

const PROVIDER_PRIORITY: Array<"openai" | "gemini" | "claude" | "deepseek"> = [
  "openai",
  "gemini",
  "claude",
  "deepseek",
]

const MAX_SUMMARY_LENGTH = 1000

export async function summarizeConversation(props: {
  workspaceId: string
  messages: Array<{ role: string; content: unknown }>
  existingSummary?: string
}): Promise<string> {
  const { workspaceId, messages, existingSummary } = props

  // 1. Find the best available AI integration
  let selectedProvider: string | undefined
  let selectedModel: IntegrationOpenAIModel | IntegrationGeminiModel | undefined

  for (const provider of PROVIDER_PRIORITY) {
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
    ? `This is the previous summary of the conversation: "${existingSummary}"

Here are the latest messages:
${messagesToSummarize}

Please update the previous summary by incorporating the new information. Keep the summary concise and succinct (under 1000 characters), focusing on key information such as: customer name, issues encountered, needs, order status, and agreed decisions. Return the new summary.`
    : `Below is the conversation history:
${messagesToSummarize}

Please summarize the above conversation concisely and succinctly (under 1000 characters). Focus on key information such as: customer name, issues encountered, needs, order status, and agreed decisions. Return the summary.`

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
        prompt: `The following summary is too long: "${finalSummary}". Please shorten it to under 1000 characters while still retaining the most important key points.`,
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
