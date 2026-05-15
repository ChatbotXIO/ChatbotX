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
  const { conversationId, contactInboxId } = props
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
      await emit("analytics:dashboard", {
        eventType: "message:bot_received",
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        messageId: "",
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
    })

    if (aiResult) {
      // Step 3: AI Agent exists → Route to AGENT
      await emit("analytics:dashboard", {
        eventType: "message:bot_received",
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        messageId: "",
        occurredAt: new Date(),
        hasResponse: true,
        responseType: "ai_agent",
        routeType: "agent",
        result: "success",
        aiProvider: aiResult.provider,
        metadata: {
          latency: Date.now() - startTime,
        },
      })
      return
    }

    // Step 4: AI Agent failed to respond → Still routed to AGENT, but response failed
    // This is NOT fallback - routing decision was AGENT, but execution failed
    await emit("analytics:dashboard", {
      eventType: "message:bot_received",
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      messageId: "",
      occurredAt: new Date(),
      hasResponse: false,
      responseType: "ai_agent",
      routeType: "agent",
      result: "success",
      aiProvider: "none",
      metadata: {
        latency: 0,
        fallbackReason: "no_intent_match",
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "triggerAutomatedResponse",
          triggerType: "bot_response_ai_agent_failed",
        },
      },
    })
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
