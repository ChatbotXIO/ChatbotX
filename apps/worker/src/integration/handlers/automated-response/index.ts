import { automatedResponseService } from "@chatbotx.io/automated-response"
import { db } from "@chatbotx.io/database/client"
import { aiMessageRoles } from "@chatbotx.io/database/partials"
import { emit } from "@chatbotx.io/event-bus"
import type { IntegrationJobProcessAutomatedResponse } from "@chatbotx.io/worker-config"
import type { ModelMessage } from "ai"
import { detectConversationAndContactInbox } from "../../../lib/db"
import { logger } from "../../../lib/logger"
import { replyByAI } from "./replies"

export async function processAutomatedResponse(
  props: IntegrationJobProcessAutomatedResponse["data"],
) {
  const { conversationId, contactInboxId, messageId } = props
  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId,
      contactInboxId,
    })

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

    const startTime = Date.now()
    const aiResult = await replyByAI({
      conversation,
      messages,
      aiAgent,
      trackingContext: messageId
        ? {
            aiProvider: "none",
            conversationId: conversation.id,
            messageId,
            responseType: "ai_agent",
            startTime,
            triggerType: "bot_response_ai_agent",
            workspaceId: conversation.workspaceId,
          }
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
    logger.error(
      {
        error,
        conversationId: conversation.id,
        workspaceId: conversation.workspaceId,
      },
      "[automated-response] triggerAutomatedResponse failed",
    )
  }
}
