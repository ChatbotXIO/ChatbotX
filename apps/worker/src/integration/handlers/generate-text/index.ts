import { prisma } from "@aha.chat/database"
import {
  AI_PROVIDERS,
  type AIProvider,
  SenderType,
} from "@aha.chat/database/types"
import { StepType } from "@aha.chat/flow-config"
import { ChatJobAction, chatQueue } from "@aha.chat/worker-config"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createId } from "@paralleldrive/cuid2"
import { type LanguageModel, streamText } from "ai"
import { logger } from "../../../lib/logger"
import type { FlowStepProps } from "../step-handler"

// Constants
const DEFAULT_MAX_TOKENS = 250
const DEFAULT_TEMPERATURE = 1
const GEMINI_MIN_TOKENS = 500
const MAX_CONVERSATION_HISTORY = 100

// Default user messages when no message is provided
// These are fallback messages for AI SDK requirement
const DEFAULT_USER_MESSAGES = {
  withPrompt: "Hãy trả lời dựa trên hướng dẫn đã cho.",
  withoutPrompt: "Xin chào, bạn có thể giúp tôi không?",
} as const

// Error message patterns for detecting invalid prompt errors
const ERROR_MESSAGE_PATTERNS = {
  EMPTY_MESSAGES: "messages must not be empty",
  INVALID_PROMPT: "Invalid prompt",
} as const

// Types
type AIMessage = {
  role: "user" | "assistant" | "system"
  content: string
}

type AIGenerateTextStep = {
  id: string
  stepType: string
  model?: string
  prompt?: string
  userMessage?: string
  resultCustomFieldId?: string
  tools?: string[]
  rememberConversation?: boolean
  temperature?: number
  maxTokens?: number
}

// Load AI tools from database based on tool IDs in step config
// Note: Tools are currently not fully implemented, this is a placeholder
// This function will be async when tools are fully implemented
function getToolsFromStepConfig(
  chatbotId: string,
  tools: string[],
): { tools: Record<string, unknown> } {
  const TOOL_PREFIX = {
    file: "file:",
    fn: "fn:",
    mcp: "mcp:",
  } as const

  function parseToolIds(toolIds: string[], prefix: string): string[] {
    return toolIds
      .filter((value) => value.startsWith(prefix))
      .map((value) => value.slice(prefix.length))
      .filter((id) => id.length > 0)
  }

  const toolSet: Record<string, unknown> = {}

  const fileIds = parseToolIds(tools, TOOL_PREFIX.file)
  const functionIds = parseToolIds(tools, TOOL_PREFIX.fn)
  const mcpIds = parseToolIds(tools, TOOL_PREFIX.mcp)

  // TODO: Implement actual tool loading and processing
  // When implemented, load tools from database:
  // - prisma.aIFile.findMany for fileIds
  // - prisma.aIFunction.findMany for functionIds
  // - prisma.aIMCPServer.findMany for mcpIds

  if (fileIds.length > 0 || functionIds.length > 0 || mcpIds.length > 0) {
    logger.debug("[ai-generate-text] Tools selected but not yet implemented", {
      chatbotId,
      fileCount: fileIds.length,
      functionCount: functionIds.length,
      mcpCount: mcpIds.length,
    })
  }

  return { tools: toolSet }
}

// Simplified streaming function
async function processStreamingText(
  textStream: AsyncIterable<string>,
  conversation: { id: string; inboxId: string; chatbotId: string },
): Promise<{ messageCount: number; fullText: string }> {
  let fullText = ""
  let messageCount = 0
  let currentSegment = ""

  for await (const delta of textStream) {
    fullText += delta
    currentSegment += delta

    // Send complete messages when we hit double newline
    if (currentSegment.includes("\n\n")) {
      const segments = currentSegment.split("\n\n")

      for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i].trim()
        if (!segment) {
          continue
        }
        messageCount += 1
        await sendTextMessage(conversation.id, segment)
      }

      currentSegment = segments.at(-1) || ""
    }
  }

  // Send remaining text
  if (currentSegment.trim()) {
    messageCount += 1
    await sendTextMessage(conversation.id, currentSegment.trim())
  }

  return { messageCount, fullText }
}

async function sendTextMessage(
  conversationId: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) {
    return
  }

  // Use chatQueue to send message like automated-response does
  await chatQueue.add(ChatJobAction.sendFlowMessage, {
    type: ChatJobAction.sendFlowMessage,
    data: {
      conversationId,
      flowVersionId: "",
      step: {
        id: createId(),
        message: trimmed,
        stepType: StepType.sendText,
        buttons: [],
      },
    },
  })
}

// AI Provider configuration type
type AIProviderConfig = {
  provider: AIProvider
  model: string
  apiKey: string
  baseURL?: string
}

// Build messages array from conversation history and step config
async function buildAIMessages(
  conversationId: string,
  step: AIGenerateTextStep,
): Promise<AIMessage[]> {
  const messages: AIMessage[] = []

  // Load conversation history if enabled
  if (step.rememberConversation) {
    const lastMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: MAX_CONVERSATION_HISTORY,
    })

    for (const msg of lastMessages) {
      if (!msg.content) {
        continue
      }

      if (msg.senderType === SenderType.contact) {
        messages.push({ role: "user", content: msg.content })
      } else if (
        msg.senderType === SenderType.user ||
        msg.senderType === SenderType.bot
      ) {
        messages.push({ role: "assistant", content: msg.content })
      }
    }

    // Reverse to get chronological order
    messages.reverse()
  }

  // Add current user message if provided
  if (step.userMessage) {
    messages.push({
      role: "user",
      content: step.userMessage,
    })
  }

  // Ensure at least one message exists (AI SDK requirement)
  if (messages.length === 0) {
    const defaultMessage = step.prompt
      ? DEFAULT_USER_MESSAGES.withPrompt
      : DEFAULT_USER_MESSAGES.withoutPrompt

    messages.push({
      role: "user",
      content: defaultMessage,
    })
  }

  return messages
}

// Unified AI Generate Text Handler
export async function handleAIGenerateText({
  conversation,
  step,
}: FlowStepProps<Record<string, unknown>>) {
  const stepConfig = step as AIGenerateTextStep

  try {
    // Build messages array
    const messages = await buildAIMessages(conversation.id, stepConfig)

    // Get AI provider configuration
    const aiConfig = await getAIProviderConfig(
      stepConfig,
      conversation.chatbotId,
    )
    if (!aiConfig) {
      return
    }

    // Create model instance
    const model = createAIModel(aiConfig, aiConfig.model)

    // Get configuration values with defaults
    const maxOutputTokens =
      typeof stepConfig.maxTokens === "number"
        ? stepConfig.maxTokens
        : DEFAULT_MAX_TOKENS
    const temperature =
      typeof stepConfig.temperature === "number"
        ? stepConfig.temperature
        : DEFAULT_TEMPERATURE

    // For Gemini, ensure minimum token requirement
    const finalMaxOutputTokens =
      aiConfig.provider === AI_PROVIDERS.GEMINI &&
      maxOutputTokens < GEMINI_MIN_TOKENS
        ? GEMINI_MIN_TOKENS
        : maxOutputTokens

    // Get tools (currently not fully implemented)
    getToolsFromStepConfig(conversation.chatbotId, stepConfig.tools || [])

    // Generate text using AI SDK
    const result = await streamText({
      model,
      system: stepConfig.prompt || "",
      messages,
      maxOutputTokens: finalMaxOutputTokens,
      temperature,
      // TODO: Implement tools when ready
      // tools: toolSet,
      // toolChoice: Object.keys(toolSet).length > 0 ? "auto" : undefined,
    })

    // Process and send streaming response
    const { messageCount, fullText } = await processStreamingText(
      result.textStream,
      conversation,
    )

    // Save result to custom field if specified
    if (messageCount > 0 && fullText && stepConfig.resultCustomFieldId) {
      await prisma.contactCustomField.upsert({
        where: {
          contactId_customFieldId: {
            contactId: conversation.contactId,
            customFieldId: stepConfig.resultCustomFieldId,
          },
        },
        update: {
          value: fullText,
        },
        create: {
          contactId: conversation.contactId,
          customFieldId: stepConfig.resultCustomFieldId,
          value: fullText,
        },
      })
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isInvalidPromptError =
      errorMessage.includes(ERROR_MESSAGE_PATTERNS.EMPTY_MESSAGES) ||
      errorMessage.includes(ERROR_MESSAGE_PATTERNS.INVALID_PROMPT)

    const errorLog: Record<string, unknown> = {
      error: errorMessage,
      errorStack: error instanceof Error ? error.stack : undefined,
      conversationId: conversation.id,
      stepId: stepConfig.id,
      stepType: stepConfig.stepType,
      isInvalidPromptError,
      stepConfig: {
        prompt: stepConfig.prompt,
        userMessage: stepConfig.userMessage,
        rememberConversation: stepConfig.rememberConversation,
        model: stepConfig.model,
        temperature: stepConfig.temperature,
        maxTokens: stepConfig.maxTokens,
        tools: stepConfig.tools,
      },
    }

    if (error && typeof error === "object" && "prompt" in error) {
      errorLog.promptDetails = error.prompt
    }

    logger.error("[ai-generate-text] Step failed", errorLog)

    // Re-throw with more context for invalid prompt errors
    if (isInvalidPromptError) {
      const errorContext =
        "Please ensure you have either a userMessage in the step config or enable rememberConversation to include conversation history."
      throw new Error(`AI generation failed: ${errorMessage}. ${errorContext}`)
    }

    throw error
  }
}

// Get AI provider configuration based on step type
async function getAIProviderConfig(
  step: AIGenerateTextStep,
  chatbotId: string,
): Promise<AIProviderConfig | null> {
  const stepType = step.stepType

  switch (stepType) {
    case StepType.openaiGenerateText: {
      const integration = await prisma.integrationOpenAI.findFirst({
        where: { chatbotId },
      })

      if (!integration?.autoReply) {
        logger.warn(
          "[ai-generate-text] OpenAI integration not found or disabled",
          {
            chatbotId,
          },
        )
        return null
      }

      if (!step.model) {
        logger.error("[ai-generate-text] OpenAI model not specified", {
          stepId: step.id,
        })
        return null
      }

      const auth = integration.auth as { secretText?: string } | undefined
      const apiKey = auth?.secretText

      if (!apiKey || apiKey.trim().length === 0) {
        logger.error("[ai-generate-text] OpenAI API key not found or empty", {
          stepId: step.id,
          chatbotId,
        })
        return null
      }

      return {
        provider: AI_PROVIDERS.OPENAI,
        model: step.model,
        apiKey,
      }
    }

    case StepType.geminiGenerateText: {
      const integration = await prisma.integrationGemini.findFirst({
        where: { chatbotId },
      })

      if (!integration) {
        logger.warn("[ai-generate-text] Gemini integration not found", {
          chatbotId,
        })
        return null
      }

      if (!step.model) {
        logger.error("[ai-generate-text] Gemini model not specified", {
          stepId: step.id,
        })
        return null
      }

      const auth = integration.auth as { secretText?: string } | null
      const apiKey = auth?.secretText

      if (!apiKey || apiKey.trim().length === 0) {
        logger.error("[ai-generate-text] Gemini API key not found or empty", {
          stepId: step.id,
          chatbotId,
        })
        return null
      }

      return {
        provider: AI_PROVIDERS.GEMINI,
        model: step.model,
        apiKey,
      }
    }

    case StepType.claudeGenerateText: {
      logger.warn("[ai-generate-text] Claude integration not yet implemented")
      return null
    }

    case StepType.deepseekGenerateText: {
      logger.warn("[ai-generate-text] DeepSeek integration not yet implemented")
      return null
    }

    default:
      return null
  }
}

// Create AI model based on provider configuration
function createAIModel(
  config: AIProviderConfig,
  modelName: string,
): LanguageModel {
  switch (config.provider) {
    case AI_PROVIDERS.OPENAI: {
      const openai = createOpenAI({ apiKey: config.apiKey })
      return openai(modelName) as LanguageModel
    }

    case AI_PROVIDERS.GEMINI: {
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey })
      return google(modelName) as unknown as LanguageModel
    }

    case AI_PROVIDERS.CLAUDE: {
      const anthropic = createAnthropic({ apiKey: config.apiKey })
      return anthropic(modelName) as unknown as LanguageModel
    }

    case AI_PROVIDERS.DEEPSEEK: {
      const openai = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      })
      return openai(modelName) as LanguageModel
    }

    default:
      throw new Error(`Unsupported provider: ${config.provider}`)
  }
}
