import {
  AI_MESSAGE_HISTORY_LOOKBACK_MS,
  MAX_CONVERSATION_HISTORY,
  systemFunctionNames,
} from "@chatbotx.io/ai"
import { aiContextService } from "@chatbotx.io/ai/server"
import { automatedResponseService } from "@chatbotx.io/automated-response"
import { db } from "@chatbotx.io/database/client"
import { isMessageStorageError } from "@chatbotx.io/database/errors"
import { aiMessageRoles } from "@chatbotx.io/database/partials"
import {
  createMessageRepository,
  findConversationAIContextState,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import { emit } from "@chatbotx.io/event-bus"
import {
  DOCX_MIME_TYPES,
  IMAGE_MIME_TYPES,
  PDF_MIME_TYPES,
} from "@chatbotx.io/sdk"
import type { IntegrationJobProcessAutomatedResponse } from "@chatbotx.io/worker-config"
import type { ModelMessage } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { sendTypingToChannel } from "../../../chat/handlers/send-message"
import { detectConversationAndContactInbox } from "../../../lib/db"
import { logger } from "../../../lib/logger"
import { replyByAI } from "./replies"

const TRIGGER_MESSAGE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000

const SUPPORTED_DOCUMENT_MIME_TYPES = new Set<string>([
  ...PDF_MIME_TYPES,
  ...DOCX_MIME_TYPES,
])
const SUPPORTED_IMAGE_MIME_TYPES = new Set<string>(IMAGE_MIME_TYPES)

function normalizeMimeType(value: string): string {
  return value.toLowerCase().split(";")[0]?.trim() ?? ""
}

function isSupportedDocumentMimeType(mimeType: string): boolean {
  return SUPPORTED_DOCUMENT_MIME_TYPES.has(normalizeMimeType(mimeType))
}

function isSupportedImageMimeType(mimeType: string): boolean {
  return SUPPORTED_IMAGE_MIME_TYPES.has(normalizeMimeType(mimeType))
}

export async function processAutomatedResponse(
  props: IntegrationJobProcessAutomatedResponse["data"],
) {
  const { conversationId, contactInboxId, messageId } = props
  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId,
      contactInboxId,
    })

  const repo = await createMessageRepository()
  const triggerMessage = await repo.findTriggerMessage({
    id: messageId,
    conversationId: conversation.id,
    workspaceId: conversation.workspaceId,
    sinceTime:
      getSafeSinceTime(
        contactInbox.lastMessageAt ?? contactInbox.createdAt,
        TRIGGER_MESSAGE_LOOKBACK_MS,
      ) ?? new Date(0),
    requireCompleteResults: true,
  })
  if (!triggerMessage) {
    logger.warn(
      {
        contactInboxId: contactInbox.id,
        conversationId: conversation.id,
        messageId,
        workspaceId: conversation.workspaceId,
      },
      "Automated response trigger message was not found",
    )
  }
  const triggerAttachments = triggerMessage?.attachments ?? []
  const isFileOnlyTrigger =
    triggerMessage?.senderType === "contact" &&
    !triggerMessage.text &&
    triggerAttachments.length > 0
  const hasTriggerImage = triggerAttachments.some(
    (attachment) =>
      isSupportedImageMimeType(attachment.mimeType) ||
      attachment.fileType === "image" ||
      attachment.fileType === "gif",
  )
  const hasTriggerDocument = triggerAttachments.some((attachment) =>
    isSupportedDocumentMimeType(attachment.mimeType),
  )

  const repliedByAutomatedResponse = await automatedResponseService.process({
    conversation,
    contactInbox,
  })
  if (repliedByAutomatedResponse) {
    return
  }

  try {
    const aiAgent = await db.query.aiAgentModel.findFirst({
      where: {
        workspaceId: conversation.workspaceId,
        isDefault: true,
      },
    })

    if (!aiAgent) {
      if (messageId) {
        await emit("analytics:dashboard", {
          eventType: "message:bot_received",
          workspaceId: conversation.workspaceId,
          conversationId: conversation.id,
          messageId,
          occurredAt: new Date(),
          hasResponse: false,
          responseType: "none",
          routeType: "fallback",
          result: "fallback",
          aiProvider: "none",
          metadata: {
            latency: 0,
            fallbackReason: "no_ai_agent",
            triggerContext: {
              triggerSource: "worker",
              triggerHandler: "triggerAutomatedResponse",
              triggerType: "bot_response_fallback_no_ai_agent",
            },
          },
        })
      }
      return
    }

    const aiContext = await aiContextService.getOrInitContext({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
    })
    const markerMessageId =
      aiContext?.markerMessageId ??
      (
        await findConversationAIContextState({
          conversationId: conversation.id,
          workspaceId: conversation.workspaceId,
        })
      )?.aiContextLastMessageId ??
      null

    let messages: ModelMessage[] = []
    let summary = ""

    if (aiContext) {
      const contextSinceTime =
        getSafeSinceTime(
          contactInbox.lastMessageAt ?? contactInbox.createdAt,
          AI_MESSAGE_HISTORY_LOOKBACK_MS,
        ) ?? new Date(0)
      const newDbMessages = await repo.findAIContextMessages({
        conversationId: conversation.id,
        limit: MAX_CONVERSATION_HISTORY,
        markerMessageId,
        sinceTime: contextSinceTime,
        workspaceId: conversation.workspaceId,
      })

      const newMessages = newDbMessages.flatMap((msg) => {
        if (!msg.text) {
          return []
        }
        let role: "user" | "assistant" | null = null
        if (msg.senderType === "contact") {
          role = "user"
        } else if (msg.senderType === "user" || msg.senderType === "bot") {
          role = "assistant"
        }
        if (!role) {
          return []
        }
        return [
          {
            message: { role, content: msg.text } as ModelMessage,
            messageId: msg.id,
            createdAt: msg.createdAt.getTime(),
          },
        ]
      })

      const refreshedContext =
        newMessages.length > 0
          ? await aiContextService.appendHistory({
              conversationId: conversation.id,
              newMessages,
            })
          : aiContext

      if (refreshedContext) {
        messages = aiContextService.mapContextToModelMessages(
          refreshedContext.history,
        )
        summary = refreshedContext.summary
      }
    }

    if (messages.length === 0) {
      const dbMessages = await repo.findAIContextMessages({
        conversationId: conversation.id,
        limit: 100,
        markerMessageId,
        sinceTime:
          getSafeSinceTime(
            contactInbox.lastMessageAt ?? contactInbox.createdAt,
            AI_MESSAGE_HISTORY_LOOKBACK_MS,
          ) ?? new Date(0),
        workspaceId: conversation.workspaceId,
      })
      const aiHistory = aiContextService.mapDbMessagesToContext(dbMessages)
      messages = aiContextService.mapContextToModelMessages(aiHistory)
    }

    if (isFileOnlyTrigger) {
      messages.push({
        role: aiMessageRoles.enum.user,
        content: getFileOnlyPrompt({
          hasDocument: hasTriggerDocument,
          hasImage: hasTriggerImage,
        }),
      })
    }

    const sendTyping = () =>
      sendTypingToChannel({
        conversation,
        contactInbox,
        typing: true,
        seconds: 5,
      }).catch((err) => {
        logger.debug(
          { err, conversationId: conversation.id },
          "[automated-response] typing indicator failed",
        )
      })

    sendTyping()
    const typingIntervalId = setInterval(sendTyping, 4000)

    const startTime = Date.now()
    let aiResult: Awaited<ReturnType<typeof replyByAI>>
    try {
      aiResult = await replyByAI({
        conversation,
        contactInboxId: contactInbox.id,
        channel: contactInbox.channel,
        messages,
        aiAgent,
        triggerMessageId: messageId,
        fileOnlyTrigger: isFileOnlyTrigger,
        allowedSystemFunctionIds: isFileOnlyTrigger
          ? getFileOnlySystemFunctionIds({
              hasDocument: hasTriggerDocument,
              hasImage: hasTriggerImage,
            })
          : undefined,
        summary,
      })
    } finally {
      clearInterval(typingIntervalId)
    }

    if (aiResult && !aiResult.usedFallbackText) {
      // AI produced its own response; bot_received emit happens inside
      // sendChatMessage via trackingContext (first streamed part only).
      return
    }

    if (aiResult?.usedFallbackText && messageId) {
      // AI used the canned fallback help text → fallback flow.
      await emit("analytics:dashboard", {
        eventType: "message:bot_received",
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        messageId,
        occurredAt: new Date(),
        hasResponse: true,
        responseType: "ai_agent",
        routeType: "agent",
        result: "fallback",
        aiProvider: aiResult.provider,
        metadata: {
          latency: Date.now() - startTime,
          fallbackReason: "no_intent_match",
          toolStats: aiResult.toolStats,
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "triggerAutomatedResponse",
            triggerType: "bot_response_ai_agent_fallback_text",
          },
        },
      })
      return
    }

    // AI agent exists but failed to produce a response → fallback flow.
    if (messageId) {
      await emit("analytics:dashboard", {
        eventType: "message:bot_received",
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        messageId,
        occurredAt: new Date(),
        hasResponse: false,
        responseType: "ai_agent",
        routeType: "agent",
        result: "fallback",
        aiProvider: "none",
        metadata: {
          latency: Date.now() - startTime,
          fallbackReason: "no_intent_match",
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "triggerAutomatedResponse",
            triggerType: "bot_response_ai_agent_failed",
          },
        },
      })
    }
  } catch (error) {
    const normalizedError = normalizeError(error)
    logger.error(
      {
        err: normalizedError,
        conversationId: conversation.id,
        workspaceId: conversation.workspaceId,
      },
      "[automated-response] triggerAutomatedResponse failed",
    )
    if (isMessageStorageError(error)) {
      throw error
    }
  }
}

function getFileOnlySystemFunctionIds(input: {
  hasDocument: boolean
  hasImage: boolean
}): string[] {
  const systemFunctionIds: string[] = []

  if (input.hasImage) {
    systemFunctionIds.push(systemFunctionNames.imageReader)
  }

  if (input.hasDocument) {
    systemFunctionIds.push(systemFunctionNames.documentReader)
  }

  return systemFunctionIds
}

function getFileOnlyPrompt(input: {
  hasDocument: boolean
  hasImage: boolean
}): string {
  if (input.hasImage && !input.hasDocument) {
    return "I uploaded an image. Please analyze it, provide a short summary, then ask what specific detail I want to know more about."
  }

  if (input.hasDocument && !input.hasImage) {
    return "I uploaded a document. Please read it, provide a short summary, then ask what specific part I want to know more about."
  }

  return "I uploaded one or more files. Please inspect the supported attachment, provide a short summary, then ask what specific detail I want to know more about."
}
