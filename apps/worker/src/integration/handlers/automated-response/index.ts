import { systemFunctionNames } from "@chatbotx.io/ai"
import { automatedResponseService } from "@chatbotx.io/automated-response"
import { db } from "@chatbotx.io/database/client"
import { aiMessageRoles } from "@chatbotx.io/database/partials"
import { emit } from "@chatbotx.io/event-bus"
import {
  DOCX_MIME_TYPES,
  IMAGE_MIME_TYPES,
  PDF_MIME_TYPES,
} from "@chatbotx.io/sdk"
import type { IntegrationJobProcessAutomatedResponse } from "@chatbotx.io/worker-config"
import type { ModelMessage } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { detectConversationAndContactInbox } from "../../../lib/db"
import { logger } from "../../../lib/logger"
import { replyByAI } from "./replies"

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

  const triggerMessage = await db.query.messageModel.findFirst({
    where: {
      id: messageId,
      conversationId: conversation.id,
    },
    columns: {
      id: true,
      text: true,
      senderType: true,
    },
    with: {
      attachments: {
        columns: {
          id: true,
          fileType: true,
          mimeType: true,
        },
      },
    },
  })
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

    const last100Messages = await db.query.messageModel.findMany({
      where: { conversationId: conversation.id },
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 100,
    })
    const messages: ModelMessage[] = []
    for (const message of last100Messages) {
      if (!message.text) {
        continue
      }
      if (message.senderType === "contact") {
        messages.push({
          role: aiMessageRoles.enum.user,
          content: message.text,
        })
      } else if (
        message.senderType === "user" ||
        message.senderType === "bot"
      ) {
        messages.push({ role: "assistant", content: message.text })
      }
    }
    messages.reverse()

    if (isFileOnlyTrigger) {
      messages.push({
        role: aiMessageRoles.enum.user,
        content: getFileOnlyPrompt({
          hasDocument: hasTriggerDocument,
          hasImage: hasTriggerImage,
        }),
      })
    }

    const startTime = Date.now()
    const aiResult = await replyByAI({
      conversation,
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
    })

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
        error: normalizedError,
        conversationId: conversation.id,
        workspaceId: conversation.workspaceId,
      },
      "[automated-response] triggerAutomatedResponse failed",
    )
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
