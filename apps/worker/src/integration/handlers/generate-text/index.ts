import { AI_PROVIDERS } from "@aha.chat/flow-config"
import { type ModelMessage, streamText } from "ai"
import { logger } from "../../../lib/logger"
import { saveResultToCustomField } from "../ai-shared-utils"
import {
  DEFAULT_MAX_TOKENS,
  EMPTY_STRING,
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

type StreamTextResult = Awaited<ReturnType<typeof streamText>>
type ToolResults = Awaited<StreamTextResult["toolResults"]>

type ConversationSummary = {
  id: string
  contactId: string | null
  inboxId: string
  chatbotId: string
}

export async function handleAIGenerateText({
  conversation,
  step,
}: FlowStepProps<Record<string, unknown>>) {
  const stepConfig = step as AIGenerateTextStep

  try {
    const messages = await buildAIMessages(conversation.id, stepConfig)

    const aiConfig = await getAIProviderConfig(
      stepConfig,
      conversation.chatbotId,
    )
    if (!aiConfig) {
      return
    }

    const model = createAIModel(aiConfig, aiConfig.model)

    const maxOutputTokens =
      typeof stepConfig.maxTokens === "number"
        ? stepConfig.maxTokens
        : DEFAULT_MAX_TOKENS
    const temperature = stepConfig.temperature

    const finalMaxOutputTokens =
      aiConfig.provider === AI_PROVIDERS.GEMINI &&
      maxOutputTokens < GEMINI_MIN_TOKENS
        ? GEMINI_MIN_TOKENS
        : maxOutputTokens

    const toolSet = await getToolsFromStepConfig(
      conversation.chatbotId,
      stepConfig.tools || [],
    )

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

    const toolCalls = await result.toolCalls
    const toolResults = await result.toolResults

    const { messageCount, fullText } = await processStreamingText(
      result.textStream,
      conversation.id,
      { sendParts: true },
    )

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
      await saveResultToCustomField({
        contactId: conversation.contactId,
        customFieldId: stepConfig.outputCfId,
        fullText,
        messageCount,
        chatbotId: conversation.chatbotId,
      })
    }
  } catch (error) {
    logger.error("[ai-generate-text] Step failed", {
      error,
      conversationId: conversation.id,
      stepId: stepConfig.id,
      stepType: stepConfig.stepType,
    })
    throw error
  }
}

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
  toolResults: ToolResults
  fullText: string
  stepConfig: AIGenerateTextStep
  conversation: ConversationSummary
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

    await saveResultToCustomField({
      contactId: conversation.contactId,
      customFieldId: stepConfig.outputCfId,
      fullText: followUpFullText,
      messageCount: followUpMessageCount,
      chatbotId: conversation.chatbotId,
    })
  } catch (followUpError) {
    logger.error("[ai-generate-text] Follow-up request failed", {
      error: followUpError,
      conversationId: conversation.id,
      stepId: stepConfig.id,
    })

    await saveResultToCustomField({
      contactId: conversation.contactId,
      customFieldId: stepConfig.outputCfId,
      fullText,
      messageCount: MAGIC_NUMBERS.ZERO_MESSAGE_COUNT,
      chatbotId: conversation.chatbotId,
    })
  }
}
