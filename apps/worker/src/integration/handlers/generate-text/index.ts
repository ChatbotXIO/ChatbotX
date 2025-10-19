import { prisma } from "@aha.chat/database"
import { SenderType } from "@aha.chat/database/types"
import { StepType } from "@aha.chat/flow-config"
import { ChatJobAction, chatQueue } from "@aha.chat/worker-config"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createId } from "@paralleldrive/cuid2"
import { type LanguageModel, streamText } from "ai"
import { logger } from "../../../lib/logger"
import type { FlowStepProps } from "../step-handler"

// Temporary types until ai-shared is properly built
type AIMessage = {
  role: "user" | "assistant" | "system"
  content: string
}

const ROLES = {
  user: "user" as const,
  assistant: "assistant" as const,
  system: "system" as const,
}

// Load AI tools from database based on tool IDs in step config
async function getToolsFromStepConfig(
  chatbotId: string,
  tools: string[],
): Promise<{ tools: Record<string, unknown> }> {
  const TOOL_PREFIX = {
    file: "file:",
    fn: "fn:",
    mcp: "mcp:",
  }

  function parseToolIds(toolIds: string[], prefix: string): string[] {
    return toolIds
      .filter((value) => value.startsWith(prefix))
      .map((value) => value.slice(prefix.length))
      .filter((id) => Boolean(id))
  }

  try {
    const toolSet: Record<string, unknown> = {}

    const fileIds = parseToolIds(tools, TOOL_PREFIX.file)
    const functionIds = parseToolIds(tools, TOOL_PREFIX.fn)
    const mcpIds = parseToolIds(tools, TOOL_PREFIX.mcp)

    // Load files if any selected
    if (fileIds.length > 0) {
      const files = await prisma.aIFile.findMany({
        where: { chatbotId, id: { in: fileIds } },
      })
      if (files.length > 0) {
        // TODO: Implement actual file search tool
        // For now, skip to avoid type errors
      }
    }

    // Load functions if any selected
    if (functionIds.length > 0) {
      await prisma.aIFunction.findMany({
        where: { chatbotId, id: { in: functionIds } },
      })
      // TODO: Implement actual AI function tools
      // For now, skip to avoid type errors
    }

    // Load MCP tools if any selected
    if (mcpIds.length > 0) {
      await prisma.aIMCPServer.findMany({
        where: { chatbotId, id: { in: mcpIds } },
      })
      // TODO: Implement actual MCP server tools
      // For now, skip to avoid type errors
    }

    logger.debug("[ai-generate-text] Loaded tools", {
      chatbotId,
      fileCount: fileIds.length,
      functionCount: functionIds.length,
      mcpCount: mcpIds.length,
      totalToolCount: Object.keys(toolSet).length,
    })

    return { tools: toolSet }
  } catch (error) {
    logger.error("[ai-generate-text] Failed to load tools", {
      error,
      chatbotId,
    })
    return { tools: {} }
  }
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

    logger.debug("[ai-generate-text] Stream delta received", {
      conversationId: conversation.id,
      deltaLength: delta.length,
      deltaContent: JSON.stringify(delta),
      currentSegmentLength: currentSegment.length,
      fullTextLength: fullText.length,
    })

    // Send complete messages when we hit double newline
    if (currentSegment.includes("\n\n")) {
      const segments = currentSegment.split("\n\n")

      for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i].trim()
        if (!segment) {
          continue
        }
        logger.debug("[ai-generate-text] Sending segment", {
          conversationId: conversation.id,
          segmentLength: segment.length,
          segment: segment.substring(0, 50),
        })
        messageCount++
        await sendTextMessage(conversation.id, segment)
      }

      currentSegment = segments.at(-1) || ""
    }
  }

  logger.debug("[ai-generate-text] Stream finished", {
    conversationId: conversation.id,
    finalSegmentLength: currentSegment.length,
    fullTextLength: fullText.length,
    finalSegment: JSON.stringify(currentSegment),
    fullText,
  })

  // Send remaining text
  if (currentSegment.trim()) {
    logger.debug("[ai-generate-text] Sending final segment", {
      conversationId: conversation.id,
      segment: currentSegment.trim(),
      length: currentSegment.trim().length,
    })
    messageCount++
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
  await chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
    type: ChatJobAction.SEND_FLOW_STEP,
    data: {
      conversationId,
      flowVersionId: "",
      step: {
        id: createId(),
        message: trimmed,
        stepType: StepType.SEND_TEXT,
        buttons: [],
      },
    },
  })
}

// AI Provider configurations
const AI_PROVIDERS = {
  OPENAI: "openai",
  GEMINI: "gemini",
  CLAUDE: "claude",
  DEEPSEEK: "deepseek",
} as const

type AIProvider = (typeof AI_PROVIDERS)[keyof typeof AI_PROVIDERS]

type AIProviderConfig = {
  provider: AIProvider
  model: string
  apiKey: string
  baseURL?: string
}

// Remove duplicate AIMessage type - use from ai-shared

// Unified AI Generate Text Handler
export async function handleAIGenerateText({
  conversation,
  step,
}: FlowStepProps<Record<string, unknown>>) {
  try {
    // Log step configuration
    logger.info("[ai-generate-text] Processing step", {
      conversationId: conversation.id,
      stepId: step.id,
      stepType: step.stepType,
      stepConfig: {
        prompt: step.prompt,
        userMessage: step.userMessage,
        rememberConversation: step.rememberConversation,
        temperature: step.temperature,
        maxTokens: step.maxTokens,
        tools: step.tools,
        resultCustomFieldId: step.resultCustomFieldId,
      },
    })

    // Get conversation history if rememberConversation is enabled
    const lastAIMessages: AIMessage[] = []
    if (step.rememberConversation) {
      const last100Messages = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "desc" },
        take: 100,
      })

      for (const msg of last100Messages) {
        if (!msg.content) {
          continue
        }
        if (msg.senderType === SenderType.CONTACT) {
          lastAIMessages.push({ role: "user", content: msg.content })
        } else if (
          msg.senderType === SenderType.USER ||
          msg.senderType === SenderType.BOT
        ) {
          lastAIMessages.push({ role: "assistant", content: msg.content })
        }
      }
      lastAIMessages.reverse()
    }

    // Add current user message if provided
    if (step.userMessage) {
      lastAIMessages.push({
        role: ROLES.user,
        content: step.userMessage as string,
      })
    }

    // Get tools from step configuration
    const { tools } = await getToolsFromStepConfig(
      conversation.chatbotId,
      (step.tools as string[]) || [],
    )

    // Get AI provider configuration
    const aiConfig = await getAIProviderConfig(step, conversation.chatbotId)
    if (!aiConfig) {
      logger.warn("[ai-generate-text] No AI provider configuration found", {
        stepType: step.stepType,
        chatbotId: conversation.chatbotId,
      })
      return
    }

    logger.info("[ai-generate-text] Starting AI generation", {
      conversationId: conversation.id,
      provider: aiConfig.provider,
      model: aiConfig.model,
      messagesCount: lastAIMessages.length,
      toolsCount: Object.keys(tools).length,
    })

    // Create model instance
    const model = createAIModel(aiConfig, aiConfig.model)

    const maxOutputTokens = (step.maxTokens as number) || 250
    const temperature = (step.temperature as number) || 1

    // For Gemini, ensure we have enough output tokens
    const finalMaxOutputTokens =
      aiConfig.provider === AI_PROVIDERS.GEMINI && maxOutputTokens < 500
        ? 500
        : maxOutputTokens

    logger.info("[ai-generate-text] Starting streaming generation", {
      conversationId: conversation.id,
      provider: aiConfig.provider,
      modelName: aiConfig.model,
      messagesCount: lastAIMessages.length,
      systemPrompt: (step.prompt as string) || "",
      lastMessages: lastAIMessages.slice(-3).map((m) => ({
        role: m.role,
        content: m.content.substring(0, 50),
      })),
      maxOutputTokens,
      finalMaxOutputTokens,
      temperature,
    })

    const result = await streamText({
      model,
      system: (step.prompt as string) || "",
      messages: lastAIMessages,
      ...({ maxOutputTokens: finalMaxOutputTokens } as Record<string, unknown>),
      temperature,
      // tools, // TODO: Implement proper tools loading
      // toolChoice: Object.keys(tools).length > 0 ? "auto" : undefined,
    })

    logger.debug("[ai-generate-text] StreamText result", {
      conversationId: conversation.id,
      provider: aiConfig.provider,
    })

    const { messageCount, fullText } = await processStreamingText(
      result.textStream,
      conversation,
    )

    if (messageCount > 0 && fullText && step.resultCustomFieldId) {
      // Save result to custom field if specified
      await prisma.contactCustomField.upsert({
        where: {
          contactId_customFieldId: {
            contactId: conversation.contactId,
            customFieldId: step.resultCustomFieldId as string,
          },
        },
        update: {
          value: fullText,
        },
        create: {
          contactId: conversation.contactId,
          customFieldId: step.resultCustomFieldId as string,
          value: fullText,
        },
      })
    }

    logger.info("[ai-generate-text] Step completed", {
      conversationId: conversation.id,
      stepId: step.id,
      provider: aiConfig.provider,
      model: aiConfig.model,
      success: messageCount > 0,
      fullTextPreview: fullText.substring(0, 200),
    })
  } catch (error) {
    logger.error("[ai-generate-text] Step failed", {
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      conversationId: conversation.id,
      stepId: step.id,
      stepType: step.stepType,
      stepConfig: {
        prompt: step.prompt,
        userMessage: step.userMessage,
        model: step.model,
        temperature: step.temperature,
        maxTokens: step.maxTokens,
        tools: step.tools,
      },
    })
    throw error
  }
}

// Get AI provider configuration based on step type
async function getAIProviderConfig(
  step: Record<string, unknown>,
  chatbotId: string,
): Promise<AIProviderConfig | null> {
  const stepType = step.stepType

  switch (stepType) {
    case "OPENAI_GENERATE_TEXT": {
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

      const model = step.model as string
      if (!model) {
        logger.error("[ai-generate-text] OpenAI model not specified", {
          stepId: step.id,
        })
        return null
      }

      const auth = integration.auth as { secretText?: string }
      return {
        provider: AI_PROVIDERS.OPENAI,
        model,
        apiKey: auth?.secretText ?? "",
      }
    }

    case "GEMINI_GENERATE_TEXT": {
      const integration = await prisma.integrationGemini.findFirst({
        where: { chatbotId },
      })
      logger.info("[ai-generate-text] Gemini integration check", {
        hasIntegration: !!integration,
        chatbotId,
      })
      if (!integration) {
        logger.warn("[ai-generate-text] Gemini integration not found", {
          chatbotId,
        })
        return null
      }

      const model = step.model as string
      if (!model) {
        logger.error("[ai-generate-text] Gemini model not specified", {
          stepId: step.id,
        })
        return null
      }

      const auth = integration.auth as { secretText?: string } | null
      const apiKey = auth?.secretText ?? ""

      logger.info("[ai-generate-text] Gemini config created", {
        model,
        hasApiKey: !!apiKey,
      })

      return {
        provider: AI_PROVIDERS.GEMINI,
        model,
        apiKey,
      }
    }

    case "CLAUDE_GENERATE_TEXT": {
      // Note: integrationClaude might not exist in current schema
      // This is a placeholder for when it's added
      logger.warn("[ai-generate-text] Claude integration not yet implemented")
      return null
    }

    case "DEEPSEEK_GENERATE_TEXT": {
      // Note: integrationDeepseek might not exist in current schema
      // This is a placeholder for when it's added
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
