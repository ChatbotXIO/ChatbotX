import { processStreamingText } from "@chatbotx.io/ai"
import { aiContextService } from "@chatbotx.io/ai/server"
import type { AIAgentProvider } from "@chatbotx.io/database/partials"
import { emit } from "@chatbotx.io/event-bus"
import { createId } from "@chatbotx.io/utils"
import type { BotResponseTrackingContext } from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import { sendMessageAndWait } from "../../utils/message"
import { parseRichResponse } from "../rich-response"
import { executeRichActions } from "../rich-response/action-executor"
import { sendRichMessages } from "../rich-response/message-sender"
import type { ReplyByAIExecutionResult, ReplyByAIProps } from "./replies"

type DirectSendTracker = {
  sent: boolean
  sentText: string
}

type HandleRichAIReplyOptions = {
  buildToolStats: () => ReplyByAIExecutionResult["toolStats"]
  directSendTracker: DirectSendTracker
  modelId: string
  props: ReplyByAIProps
  provider: AIAgentProvider
  startTime: number
  textStream: AsyncIterable<string>
}

export async function handleRichAIReply({
  buildToolStats,
  directSendTracker,
  modelId,
  props,
  provider,
  startTime,
  textStream,
}: HandleRichAIReplyOptions): Promise<null | ReplyByAIExecutionResult> {
  const { conversation } = props
  const { fullText } = await processStreamingText(
    textStream,
    async () => {
      // Rich mode buffers the whole response, so partial text is ignored.
    },
    { sendParts: false },
  ).catch(async (streamError) => {
    const normalizedError = normalizeError(streamError)
    logger.error(
      {
        provider,
        modelId,
        conversationId: conversation.id,
        error: normalizedError,
      },
      "[automated-response] processStreamingText threw error",
    )
    await emitStreamFailureAnalytics({
      conversationId: conversation.id,
      messageId: props.triggerMessageId,
      modelId,
      provider,
      startTime,
      workspaceId: conversation.workspaceId,
    })
    return { messageCount: 0, fullText: "" }
  })

  if (directSendTracker.sent) {
    if (directSendTracker.sentText) {
      await appendAssistantHistory(conversation.id, directSendTracker.sentText)
    }
    return buildSuccessResult({ buildToolStats, modelId, provider })
  }

  const executionId = props.triggerMessageId as string
  const trackingContext = buildTrackingContext({
    conversationId: conversation.id,
    executionId,
    provider,
    startTime,
    workspaceId: conversation.workspaceId,
  })

  const parseResult = parseRichResponse(fullText)
  if (!parseResult.ok) {
    logger.warn(
      {
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        reason: parseResult.reason,
      },
      "[rich-response] invalid AI rich response",
    )

    if (parseResult.reason === "plain_text" && parseResult.text.trim()) {
      const trimmedText = parseResult.text.trim()
      await sendMessageAndWait(conversation.id, trimmedText, trackingContext)
      await appendAssistantHistory(conversation.id, trimmedText)
      return buildSuccessResult({ buildToolStats, modelId, provider })
    }

    return null
  }

  const richResponse = parseResult.data
  const flowContextId = createId()
  const context = {
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    contactId: conversation.contactId,
    contactInboxId: props.contactInboxId,
    channel: props.channel,
    executionId,
    flowContextId,
  }

  const messageResult =
    richResponse.messages.length > 0
      ? await sendRichMessages(richResponse.messages, context, trackingContext)
      : { enqueued: 0, skipped: 0 }
  const actionResult = await executeRichActions(richResponse.actions, context)
  const hasSentMessages = messageResult.enqueued > 0
  const hasExecutedAction = actionResult.executed > 0

  if (!(hasSentMessages || hasExecutedAction)) {
    logger.warn(
      {
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        executionId,
        failedActions: actionResult.failed,
        messageResult,
      },
      "[rich-response] action-only response failed without sending messages",
    )
    return null
  }

  if (!hasSentMessages) {
    await emit("analytics:dashboard", {
      eventType: "message:bot_received",
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      messageId: executionId,
      occurredAt: new Date(),
      hasResponse: true,
      responseType: "ai_agent",
      routeType: "agent",
      result: "success",
      aiProvider: provider,
      metadata: {
        latency: Date.now() - startTime,
        modelId,
        richMode: true,
        actionResult,
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "replyByAI",
          triggerType: "rich_response_action_only",
        },
      },
    })
  }

  await appendAssistantHistory(conversation.id, fullText)

  return buildSuccessResult({ buildToolStats, modelId, provider })
}

async function appendAssistantHistory(
  conversationId: string,
  content: string,
): Promise<void> {
  await aiContextService.appendHistory({
    conversationId,
    newMessages: [
      {
        message: { role: "assistant", content },
        createdAt: Date.now(),
      },
    ],
  })
}

function buildTrackingContext(input: {
  conversationId: string
  executionId: string
  provider: AIAgentProvider
  startTime: number
  workspaceId: string
}): BotResponseTrackingContext {
  return {
    aiProvider: input.provider,
    conversationId: input.conversationId,
    messageId: input.executionId,
    responseType: "ai_agent",
    startTime: input.startTime,
    triggerType: "rich_response",
    workspaceId: input.workspaceId,
  }
}

async function emitStreamFailureAnalytics(input: {
  conversationId: string
  messageId?: string
  modelId: string
  provider: AIAgentProvider
  startTime: number
  workspaceId: string
}): Promise<void> {
  if (!input.messageId) {
    return
  }

  await emit("analytics:dashboard", {
    eventType: "message:bot_received",
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    occurredAt: new Date(),
    hasResponse: false,
    responseType: "ai_agent",
    routeType: "agent",
    result: "fallback",
    aiProvider: input.provider,
    metadata: {
      latency: Date.now() - input.startTime,
      fallbackReason: "ai_stream_error",
      modelId: input.modelId,
      richMode: true,
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "replyByAI",
        triggerType: "rich_response_stream_failed",
      },
    },
  })
}

function buildSuccessResult(input: {
  buildToolStats: () => ReplyByAIExecutionResult["toolStats"]
  modelId: string
  provider: AIAgentProvider
}): ReplyByAIExecutionResult {
  return {
    responded: true,
    provider: input.provider,
    modelId: input.modelId,
    usedFallbackText: false,
    toolStats: input.buildToolStats(),
  }
}
