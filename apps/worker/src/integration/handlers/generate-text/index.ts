import { prisma } from "@aha.chat/database"
import { AI_PROVIDERS } from "@aha.chat/database/types"
import { type ModelMessage, streamText } from "ai"
import { logger } from "../../../lib/logger"
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  EMPTY_STRING,
  ERROR_CONTEXT_MESSAGES,
  ERROR_MESSAGE_PATTERNS,
  GEMINI_MIN_TOKENS,
  MAGIC_NUMBERS,
  TEXT,
  TOOL_CHOICE,
  TOOL_RESULT_PREFIX,
  TOOL_RESULT_SUFFIX,
} from "../automated-response/constants"
import { processStreamingText } from "../automated-response/text"
import type { FlowStepProps } from "../step-handler"
import { buildAIMessages } from "./messages"
import { createAIModel, getAIProviderConfig } from "./provider"
import { getToolsFromStepConfig } from "./tools"
import type { AIGenerateTextStep } from "./types"

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

    // Get tools from step config
    const toolSet = await getToolsFromStepConfig(
      conversation.chatbotId,
      stepConfig.tools || [],
    )

    // Generate text using AI SDK
    const result = await streamText({
      model,
      system: stepConfig.prompt || EMPTY_STRING,
      messages,
      maxOutputTokens: finalMaxOutputTokens,
      temperature,
      tools: toolSet,
      toolChoice:
        Object.keys(toolSet).length > 0 ? TOOL_CHOICE.AUTO : undefined,
    })

    // Get tool calls and results
    const toolCalls = await result.toolCalls
    const toolResults = await result.toolResults

    // Process and send streaming response
    const { messageCount, fullText } = await processStreamingText(
      result.textStream,
      conversation.id,
      { sendParts: true },
    )

    // Handle tool calls with follow-up request
    if (toolCalls && toolCalls.length > 0) {
      await handleToolCallsFollowUp({
        model,
        messages,
        toolResults,
        fullText,
        stepConfig,
        conversation,
        finalMaxOutputTokens,
        temperature,
      })
    } else {
      // Save result to custom field if specified (only if no tool calls)
      await saveResultToCustomField(
        conversation.contactId,
        stepConfig.resultCustomFieldId,
        fullText,
        messageCount,
      )
    }
  } catch (error) {
    handleError(error, conversation, stepConfig)
  }
}

// Handle tool calls with follow-up request
async function handleToolCallsFollowUp({
  model,
  messages,
  toolResults,
  fullText,
  stepConfig,
  conversation,
  finalMaxOutputTokens,
  temperature,
}: {
  model: ReturnType<typeof createAIModel>
  messages: Awaited<ReturnType<typeof buildAIMessages>>
  toolResults: Awaited<Awaited<ReturnType<typeof streamText>>["toolResults"]>
  fullText: string
  stepConfig: AIGenerateTextStep
  conversation: {
    id: string
    contactId: string | null
    inboxId: string
    chatbotId: string
  }
  finalMaxOutputTokens: number
  temperature: number
}): Promise<void> {
  const toolResultsText = toolResults
    .map(
      (r) =>
        `${TOOL_RESULT_PREFIX}${r.toolName}${TOOL_RESULT_SUFFIX}${r.output}`,
    )
    .join("\n\n")

  const followUpMessages: ModelMessage[] = [
    ...messages,
    {
      role: "assistant",
      content: fullText || TEXT.assistantFoundPrefix,
    },
    {
      role: "user",
      content: `${TEXT.followUpInstruction}\n\n${toolResultsText}`,
    },
  ]

  try {
    const followUpResult = await streamText({
      model,
      system: stepConfig.prompt || EMPTY_STRING,
      messages: followUpMessages,
      maxOutputTokens: finalMaxOutputTokens,
      temperature,
    })

    const { messageCount: followUpMessageCount, fullText: followUpFullText } =
      await processStreamingText(followUpResult.textStream, conversation.id, {
        sendParts: true,
      })

    // Save follow-up result to custom field if specified
    await saveResultToCustomField(
      conversation.contactId,
      stepConfig.resultCustomFieldId,
      followUpFullText,
      followUpMessageCount,
    )
  } catch (followUpError) {
    logger.error("[ai-generate-text] Follow-up request failed", {
      error: followUpError,
      conversationId: conversation.id,
      stepId: stepConfig.id,
    })
    // Continue with original result even if follow-up fails
    await saveResultToCustomField(
      conversation.contactId,
      stepConfig.resultCustomFieldId,
      fullText,
      MAGIC_NUMBERS.ZERO_MESSAGE_COUNT, // Indicates saving original result
    )
  }
}

// Save result to custom field if specified
async function saveResultToCustomField(
  contactId: string | null,
  customFieldId: string | undefined,
  fullText: string,
  messageCount: number,
): Promise<void> {
  if (!contactId) {
    return
  }
  if (!customFieldId) {
    return
  }
  if (messageCount === 0) {
    return
  }
  if (!fullText) {
    return
  }

  await prisma.contactCustomField.upsert({
    where: {
      contactId_customFieldId: {
        contactId,
        customFieldId,
      },
    },
    update: {
      value: fullText,
    },
    create: {
      contactId,
      customFieldId,
      value: fullText,
    },
  })
}

// Handle errors with proper logging and context
function handleError(
  error: unknown,
  conversation: { id: string; contactId: string | null },
  stepConfig: AIGenerateTextStep,
): never {
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
    throw new Error(
      `${ERROR_CONTEXT_MESSAGES.AI_GENERATION_FAILED} ${errorMessage}. ${ERROR_CONTEXT_MESSAGES.INVALID_PROMPT}`,
    )
  }

  throw error
}
